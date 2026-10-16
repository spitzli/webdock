import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePluginManifest } from "../../plugin-sdk/src/contracts/index.ts";
import {
  checkPluginCompatibility,
  planPluginTransition,
  dependencyBlockers,
} from "./plugin-lifecycle.ts";
const manifest = () =>
  parsePluginManifest(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../tools/plugins/fixtures/project-notes.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
const installed = (overrides = {}) => ({
  id: "project-notes",
  kind: "external" as const,
  revision: "1",
  desiredState: "enabled" as const,
  state: "enabled" as const,
  version: "1.0.0",
  imageDigest: "sha256:" + "a".repeat(64),
  runtime: "ready" as const,
  blockers: [],
  ...overrides,
});
test("keepsDisableDrainingWhileResourcesRemain", () => {
  const blockers = [
    { code: "retained_mail", message: "Incoming mail remains", count: 1 },
  ];
  assert.deepEqual(planPluginTransition(installed(), "disabled", blockers), {
    state: "draining",
    desiredState: "disabled",
    blockers,
  });
  assert.equal(
    planPluginTransition(installed(), "disabled", []).state,
    "disabled",
  );
});
test("doesNotEnableWithoutReadyRuntime", () => {
  const result = planPluginTransition(
    installed({ state: "disabled", runtime: "stopped" }),
    "enabled",
    [],
  );
  assert.equal(result.state, "disabled");
  assert.ok(result.blockers.some((b) => b.code === "runtime_not_ready"));
  assert.equal(
    planPluginTransition(
      installed({ kind: "builtin", runtime: "absent", state: "disabled" }),
      "enabled",
      [{ code: "owner_missing", message: "No owner" }],
    ).state,
    "disabled",
  );
  assert.equal(
    planPluginTransition(
      installed({ kind: "builtin", runtime: "absent", state: "disabled" }),
      "enabled",
      [],
    ).state,
    "enabled",
  );
});
test("blocksDependencyRemovalOrUpgradeWhileDependentsAreActive", () => {
  const dependent = installed({
    id: "dependent",
    dependencies: [{ id: "project-notes", version: "1.0.0" }],
  });
  assert.equal(
    dependencyBlockers("project-notes", null, [dependent]).length,
    1,
  );
  assert.equal(
    dependencyBlockers("project-notes", "2.0.0", [dependent]).length,
    1,
  );
  assert.equal(
    dependencyBlockers("project-notes", "1.0.0", [dependent]).length,
    0,
  );
  assert.equal(
    dependencyBlockers("project-notes", null, [
      { ...dependent, state: "disabled" },
    ]).length,
    0,
  );
});
test("checks core semver, missing dependencies and cycles across installed releases", () => {
  assert.equal(checkPluginCompatibility(manifest(), "0.1.0", []).length, 0);
  assert.ok(
    checkPluginCompatibility(manifest(), "1.0.0", []).some(
      (b) => b.code === "core_incompatible",
    ),
  );
  const m = manifest();
  m["x-webdock"].dependencies = [{ id: "dependent", version: "1.0.0" }];
  assert.ok(
    checkPluginCompatibility(m, "0.1.0", []).some(
      (b) => b.code === "dependency_unavailable",
    ),
  );
  assert.ok(
    checkPluginCompatibility(m, "0.1.0", [
      installed({
        id: "dependent",
        dependencies: [{ id: "project-notes", version: "1.0.0" }],
      }),
    ]).some((b) => b.code === "dependency_cycle"),
  );
});
test("dependent veto preserves current availability instead of draining its dependency", () => {
  const blockers = [
    {
      code: "active_dependent",
      message: "dependent requires project-notes@1.0.0",
    },
  ];
  assert.equal(
    planPluginTransition(installed(), "disabled", blockers).state,
    "enabled",
  );
});
