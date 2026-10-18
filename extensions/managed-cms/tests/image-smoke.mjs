import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { randomBytes, generateKeyPairSync } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

const image = process.env.PLUGIN_TEST_IMAGE ?? "webdock-managed-cms:0.1.0-alpha.1";
const dir = await mkdtemp(join(tmpdir(), "cms-image-"));
const name = "webdock-cms-image-" + randomBytes(8).toString("hex");
const label = "webdock.cms-image";
const docker = (...args) => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000,
}).trim();
try {
  const publicKey = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
  const cert = join(dir, "cert.pem"), key = join(dir, "key.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", key, "-out", cert, "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"], { stdio: "ignore" });
  // The host directory stays 0700; individual readonly binds allow the runtime UID to read TLS.
  await chmod(key, 0o444);
  await writeFile(join(dir, "host.pem"), publicKey, { mode: 0o444 });
  await writeFile(join(dir, "runtime.env"), [
    `WEBDOCK_PLUGIN_RUNTIME_TOKEN=${randomBytes(32).toString("hex")}`,
    "WEBDOCK_PLUGIN_HOST_URL=https://callback.example.test",
    "WEBDOCK_PLUGIN_CONSOLE_ORIGIN=https://console.example.test",
    "WEBDOCK_PLUGIN_GENERATION=1",
    "WEBDOCK_PLUGIN_TLS_CERT=/run/tls/cert.pem",
    "WEBDOCK_PLUGIN_TLS_KEY=/run/tls/key.pem",
    "",
  ].join("\n"), { mode: 0o600 });
  docker("run", "-d", "--name", name, "--label", `${label}=${name}`, "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--network", "bridge", "--env-file", join(dir, "runtime.env"),
    ...["cert.pem", "key.pem", "host.pem"].flatMap(file => ["--mount", `type=bind,src=${join(dir, file)},dst=/run/tls/${file},readonly`]),
    "--tmpfs", "/tmp:rw,nosuid,nodev,size=16m", "-p", "127.0.0.1::3443", "-p", "127.0.0.1::3444", "--entrypoint", "/bin/sh", image,
    "-c", 'export WEBDOCK_PLUGIN_HOST_PUBLIC_KEY="$(cat /run/tls/host.pem)"; exec bun /app/runtime.js');
  const tlsPort = docker("port", name, "3443/tcp").split(":").at(-1);
  const ui = "http://" + docker("port", name, "3444/tcp");
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try { if ((await fetch(ui + "/ui/cms")).status === 200) { ready = true; break; } } catch {}
    await sleep(200);
  }
  assert.ok(ready, "Image starts with non-root user and read-only filesystem");
  const html = await fetch(ui + "/ui/cms");
  assert.match(html.headers.get("content-security-policy"), /frame-ancestors https:\/\/console.example.test;/);
  assert.match(await html.text(), /<html/i);
  for (const asset of ["cms.js", "cms.css"]) {
    const response = await fetch(ui + "/ui/" + asset);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).length > 0);
  }
  for (const action of ["cms.instances", "cms.create", "cms.read", "cms.write"]) {
    assert.equal((await fetch(ui + "/actions/" + action, { method: "POST" })).status, 404);
  }
  const https = (path, ...extra) => execFileSync("curl", ["--silent", "--show-error", "--cacert", cert, ...extra, `https://localhost:${tlsPort}${path}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10000 });
  const health = JSON.parse(https("/healthz", "--fail"));
  assert.equal(health.pluginID, "managed-cms");
  assert.equal(health.version, "0.1.0-alpha.1");
  assert.equal(health.generation, 1);
  assert.equal(https("/actions/cms.instances", "--request", "POST", "--output", "/dev/null", "--write-out", "%{http_code}"), "401");
  assert.equal(docker("inspect", "--format", "{{.Config.User}}", name), "65532:65532");
  console.log(JSON.stringify({ passed: true, image, checks: ["non-root read-only runtime", "verified private TLS health identity", "public UI assets and Console CSP", "public actions isolated", "private actions authenticated"] }));
} finally {
  try {
    let owner;
    try { owner = docker("inspect", "--format", `{{index .Config.Labels "${label}"}}`, name); } catch {}
    if (owner !== undefined) {
      assert.equal(owner, name, "Only this smoke test's container may be removed");
      docker("rm", "-f", name);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
}
