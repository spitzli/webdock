import { readFile, writeFile } from "node:fs/promises";
import { installationJSONSchema } from "../../packages/module-sdk/src/installation-json-schema";
import { createRegistry } from "../../packages/module-sdk/src/index";
import { installationRegistry } from "../../apps/control-plane/src/installation";
import { mailManifest } from "../../modules/mail/src/manifest";
import { hostingManifest } from "../../modules/hosting/src/manifest";
import { databasesManifest } from "../../modules/databases/src/manifest";
import { cmsManifest } from "../../modules/cms/src/manifest";
import { storageManifest } from "../../modules/storage/src/manifest";
import { billingManifest } from "../../modules/billing/src/manifest";
const manifests = [
  mailManifest,
  hostingManifest,
  databasesManifest,
  cmsManifest,
  storageManifest,
  billingManifest,
];
if (
  createRegistry(manifests).publicView().revision !==
  installationRegistry({}).publicView().revision
)
  throw Error("Release and API manifest inventories differ");
const path = new URL(
  "../../deploy/helm/webdock/values.schema.json",
  import.meta.url,
);
const previous = await readFile(path, "utf8");
const schema = JSON.parse(previous);
schema.properties.modules = installationJSONSchema(manifests);
const next = JSON.stringify(schema, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (previous !== next)
    throw Error(
      "Helm module schema is stale; run tools/release/generate-chart-schema.ts",
    );
} else await writeFile(path, next);
