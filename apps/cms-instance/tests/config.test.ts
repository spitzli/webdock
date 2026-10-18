import test from "node:test";
import assert from "node:assert/strict";
import { loadCMSConfig } from "../src/lib/config.ts";
const environment = {
  CMS_INSTANCE_ID: "binding",
  CMS_PROJECT_ID: "project",
  CMS_ORIGIN: "https://cms.example.test",
  CMS_SITE_NAME: "Example",
  CMS_BRIDGE_SECRET: "b".repeat(32),
  PAYLOAD_SECRET: "p".repeat(32),
  DATABASE_URL: "postgresql://runtime:password@db.example.test/cms",
};
test("CMS configuration requires an exact HTTPS origin and separates runtime from migration credentials", () => {
  const config = loadCMSConfig(environment);
  assert.equal(config.mediaDirectory, "/data/media");
  assert.equal(config.instance, "binding");
  for (const patch of [
    { CMS_ORIGIN: "https://cms.example.test/path" },
    { CMS_ORIGIN: "http://cms.example.test" },
    { CMS_BRIDGE_SECRET: "short" },
    { CMS_INSTANCE_ID: "" },
    { CMS_MIGRATION_DATABASE_URL: environment.DATABASE_URL },
  ])
    assert.throws(() => loadCMSConfig({ ...environment, ...patch }));
  assert.throws(() => loadCMSConfig({ ...environment, CMS_MIGRATING: "true" }));
  assert.equal(
    loadCMSConfig({
      ...environment,
      DATABASE_URL: undefined,
      CMS_MIGRATING: "true",
      CMS_MIGRATION_DATABASE_URL:
        "postgresql://migration:password@db.example.test/cms",
    }).databaseURL.includes("migration:"),
    true,
  );
});
