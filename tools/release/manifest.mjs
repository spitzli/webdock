import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
export const images = [
  "api-core",
  "console-core",
  "api",
  "worker",
  "migrate",
  "console",
  "auth",
  "agent",
  "mail-runtime",
];
export const databaseImages = ["database-gateway", "tabularis-runtime"];
export const databaseExecutionChecks = [
  "database-gateway-managed-runtime",
  "tabularis-runtime-version",
];
export const evidenceImages = (evidence) => [
  ...images,
  ...(evidence.databaseRuntime ? databaseImages : []),
];
export const evidenceChecks = (evidence) => [
  ...executionChecks,
  ...(evidence.databaseRuntime ? databaseExecutionChecks : []),
];
export const executionChecks = [
  "core-product-boundary",
  "core-images-fresh-installation",
  "api-module-tests",
  "api-runtime-configurations",
  "worker-pool-tests",
  "migration-config-tests",
  "console-http-assets",
  "auth-http-assets",
  "agent-entrypoint",
  "mail-runtime-version",
];
const digest = (content) => createHash("sha256").update(content).digest("hex");
export function validateVersion(version) {
  if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(version))
    throw Error("Expected a semantic release version");
  return version;
}
export function validateEvidence(evidence, revision) {
  if (
    !evidence ||
    evidence.schemaVersion !== 1 ||
    evidence.revision !== revision ||
    !["linux/amd64", "linux/arm64"].includes(evidence.platform) ||
    evidence.runnerPlatform !== evidence.platform ||
    evidence.emulated !== false
  )
    throw Error("Missing native architecture execution evidence");
  if (
    !Array.isArray(evidence.checks) ||
    evidenceChecks(evidence).some(
      (name) =>
        !evidence.checks.some(
          (check) => check.name === name && check.passed === true,
        ),
    )
  )
    throw Error("Missing architecture execution check");
  if (
    !evidence.imageIndexDigests ||
    evidenceImages(evidence).some(
      (name) => !/^sha256:[a-f0-9]{64}$/.test(evidence.imageIndexDigests[name]),
    )
  )
    throw Error("Missing tested image digest evidence");
  if (evidence.databaseRuntime) {
    const source = evidence.databaseRuntime;
    if (
      !/^[a-f0-9]{40}$/.test(source.sourceCommit) ||
      !/^[a-f0-9]{40}$/.test(source.sourceTree) ||
      !/^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(source.sourceImage)
    )
      throw Error("Invalid pinned database runtime evidence");
  }
  return evidence.platform;
}
/** Read only named metadata blobs; never extract archive files onto disk. */
export function inspectOCIArchive(file) {
  const extract = (name) =>
    execFileSync("tar", ["-xOf", file, name], { maxBuffer: 16 * 1024 * 1024 });
  const indexBytes = extract("index.json"),
    index = JSON.parse(indexBytes);
  if (index.schemaVersion !== 2 || !Array.isArray(index.manifests))
    throw Error("Invalid OCI index");
  const manifests = [],
    seen = new Set();
  const blob = (descriptor) => {
    if (!/^sha256:[a-f0-9]{64}$/.test(descriptor?.digest))
      throw Error("Invalid OCI digest");
    const value = extract("blobs/sha256/" + descriptor.digest.slice(7));
    if (
      "sha256:" + digest(value) !== descriptor.digest ||
      value.length !== descriptor.size
    )
      throw Error("OCI blob digest mismatch");
    return JSON.parse(value);
  };
  const visit = (descriptor) => {
    if (seen.has(descriptor.digest)) return;
    if (seen.size >= 128) throw Error("OCI metadata limit exceeded");
    seen.add(descriptor.digest);
    const content = blob(descriptor);
    if (Array.isArray(content.manifests)) {
      for (const child of content.manifests) visit(child);
      return;
    }
    if (
      descriptor.annotations?.["vnd.docker.reference.type"] ===
      "attestation-manifest"
    )
      return;
    const config = blob(content.config);
    if (config.os === "unknown" && config.architecture === "unknown") return;
    const platform = `${config.os}/${config.architecture}`;
    if (!["linux/amd64", "linux/arm64"].includes(platform))
      throw Error("Unsupported OCI platform");
    if (
      descriptor.platform &&
      `${descriptor.platform.os}/${descriptor.platform.architecture}` !==
        platform
    )
      throw Error("OCI platform mismatch");
    manifests.push({ platform, digest: descriptor.digest });
  };
  for (const descriptor of index.manifests) visit(descriptor);
  if (!manifests.length) throw Error("OCI archive has no executable image");
  return {
    indexDigest: "sha256:" + digest(indexBytes),
    manifests: manifests.sort(
      (a, b) =>
        a.platform.localeCompare(b.platform) ||
        a.digest.localeCompare(b.digest),
    ),
  };
}
async function fileHash(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return { bytes: (await stat(file)).size, sha256: hash.digest("hex") };
}
function requiredArtifacts(artifacts, version, evidence) {
  const chartNames = [
    "webdock",
    "webdock-agent",
    ...(evidence.databaseRuntime ? ["webdock-databases"] : []),
  ];
  const expected = new Set([
    ...evidenceImages(evidence).map((name) => `${name}.oci.tar`),
    ...chartNames.map((name) => `${name}-${version}.tgz`),
  ]);
  if (artifacts.some((artifact) => !expected.has(artifact.file)))
    throw Error("Unexpected artifact without matching execution evidence");
  for (const name of evidenceImages(evidence))
    if (!artifacts.some((item) => item.file === `${name}.oci.tar`))
      throw Error(`Missing ${name} image`);
  for (const name of [
    "webdock",
    "webdock-agent",
    ...(evidence.databaseRuntime ? ["webdock-databases"] : []),
  ])
    if (!artifacts.some((item) => item.file === `${name}-${version}.tgz`))
      throw Error(`Missing ${name} chart`);
}
export async function createManifest(directory, version, revision) {
  validateVersion(version);
  if (!/^[a-f0-9]{40}$/.test(revision))
    throw Error("Expected full source Git SHA");
  const evidence = JSON.parse(
    await readFile(join(directory, "architecture-evidence.json"), "utf8"),
  );
  const platform = validateEvidence(evidence, revision);
  const artifacts = [];
  for (const file of (await readdir(directory))
    .filter((name) => /\.(?:oci\.tar|tgz)$/.test(name))
    .sort()) {
    const kind = file.endsWith(".oci.tar") ? "oci-image" : "helm-chart";
    const oci =
      kind === "oci-image"
        ? inspectOCIArchive(join(directory, file))
        : undefined;
    if (
      oci &&
      (oci.manifests.some((item) => item.platform !== platform) ||
        !oci.manifests.some((item) => item.platform === platform))
    )
      throw Error("Image architecture lacks matching execution evidence");
    if (
      oci &&
      evidence.imageIndexDigests[file.replace(".oci.tar", "")] !==
        oci.indexDigest
    )
      throw Error("Image differs from architecture execution evidence");
    artifacts.push({
      file,
      ...(await fileHash(join(directory, file))),
      kind,
      ...(oci ? { oci } : {}),
    });
  }
  requiredArtifacts(artifacts, version, evidence);
  const manifest = {
    schemaVersion: 2,
    version,
    revision,
    runtime: { node: "24.15.0", bun: "1.4.3" },
    moduleSDKVersion: 1,
    agentProtocolVersion: "webdock-hosting-agent-v1",
    supportedArchitectures: [platform],
    architectureEvidence: evidence,
    databaseRuntime: evidence.databaseRuntime ?? null,
    artifacts,
  };
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  const checksums = [
    ...artifacts.map((a) => `${a.sha256}  ${a.file}`),
    `${(await fileHash(join(directory, "manifest.json"))).sha256}  manifest.json`,
    `${(await fileHash(join(directory, "architecture-evidence.json"))).sha256}  architecture-evidence.json`,
  ];
  await writeFile(join(directory, "SHA256SUMS"), checksums.join("\n") + "\n");
  return manifest;
}
export async function verifyManifest(directory) {
  const manifest = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  );
  validateVersion(manifest.version);
  if (
    manifest.schemaVersion !== 2 ||
    !/^[a-f0-9]{40}$/.test(manifest.revision) ||
    manifest.moduleSDKVersion !== 1 ||
    manifest.agentProtocolVersion !== "webdock-hosting-agent-v1" ||
    !Array.isArray(manifest.artifacts)
  )
    throw Error("Invalid manifest");
  const platform = validateEvidence(
    manifest.architectureEvidence,
    manifest.revision,
  );
  if (
    JSON.stringify(manifest.supportedArchitectures) !==
    JSON.stringify([platform])
  )
    throw Error("Unsupported architecture claim");
  const evidence = JSON.parse(
    await readFile(join(directory, "architecture-evidence.json"), "utf8"),
  );
  if (
    JSON.stringify(evidence) !== JSON.stringify(manifest.architectureEvidence)
  )
    throw Error("Architecture evidence mismatch");
  if (
    JSON.stringify(manifest.databaseRuntime) !==
    JSON.stringify(evidence.databaseRuntime ?? null)
  )
    throw Error("Database runtime evidence mismatch");
  requiredArtifacts(manifest.artifacts, manifest.version, evidence);
  const files = new Set();
  for (const artifact of manifest.artifacts) {
    if (
      typeof artifact.file !== "string" ||
      basename(artifact.file) !== artifact.file ||
      files.has(artifact.file)
    )
      throw Error("Invalid artifact path");
    files.add(artifact.file);
    const actual = await fileHash(join(directory, artifact.file));
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256)
      throw Error(`Artifact mismatch: ${artifact.file}`);
    if (artifact.file.endsWith(".oci.tar")) {
      const oci = inspectOCIArchive(join(directory, artifact.file));
      if (
        manifest.architectureEvidence.imageIndexDigests[
          artifact.file.replace(".oci.tar", "")
        ] !== oci.indexDigest ||
        JSON.stringify(oci) !== JSON.stringify(artifact.oci) ||
        oci.manifests.some((item) => item.platform !== platform)
      )
        throw Error("OCI manifest or architecture mismatch");
    }
  }
  for (const file of await readdir(directory))
    if (/\.(?:oci\.tar|tgz)$/.test(file) && !files.has(file))
      throw Error(`Unexpected archive outside manifest: ${file}`);
  return manifest;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, directory, version, revision] = process.argv.slice(2);
  if (mode === "create") await createManifest(directory, version, revision);
  else if (mode === "verify") await verifyManifest(directory);
  else
    throw Error(
      "Use manifest.mjs create DIRECTORY VERSION REVISION | verify DIRECTORY",
    );
}
