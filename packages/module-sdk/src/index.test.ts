import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, ModuleError } from "./index.ts";
const mail = {
  id: "mail",
  version: "0.1.0",
  sdkVersion: 1,
  dependencies: [],
  navigation: [
    { slot: "tenant.services", id: "mail", label: "Mail", path: "/mail" },
  ],
} as const;
test("products are opt-in with both missing and explicit empty configuration", () => {
  assert.equal(createRegistry([mail]).state("mail"), "disabled");
  const registry = createRegistry([mail], { configVersion: 1, modules: {} });
  assert.equal(registry.state("mail"), "disabled");
  assert.deepEqual(registry.navigation("tenant.services"), []);
  assert.throws(() => registry.require("mail"), ModuleError);
});
test("strict config rejects unknown modules, malformed states and unsupported versions", () => {
  for (const config of [
    { configVersion: 2, modules: {} },
    { configVersion: 1, modules: { typo: true } },
    { configVersion: 1, modules: { mail: { enabled: "false" } } },
    {
      configVersion: 1,
      modules: { mail: { enabled: false, state: "enabled" } },
    },
    { configVersion: 1, modules: { mail: { state: "oops" } } },
    { configVersion: 1, modules: [], secrets: "no" },
  ]) {
    assert.throws(() => createRegistry([mail], config));
  }
});
test("draining serves existing resources but rejects provisioning", () => {
  const registry = createRegistry([mail], {
    configVersion: 1,
    modules: { mail: { state: "draining" } },
  });
  registry.require("mail");
  assert.throws(() => registry.require("mail", "provision"), /draining/);
  assert.equal(registry.navigation("tenant.services").length, 1);
  assert.deepEqual(registry.publicView().modules, { mail: "draining" });
});
test("manifest validation catches duplicate IDs, incompatible SDKs, missing dependencies and cycles", () => {
  assert.throws(() => createRegistry([mail, mail]));
  assert.throws(() => createRegistry([{ ...mail, sdkVersion: 2 }]));
  assert.throws(() => createRegistry([{ ...mail, dependencies: ["missing"] }]));
  assert.throws(() => createRegistry([{ ...mail, dependencies: ["mail"] }]));
  assert.throws(() =>
    createRegistry(
      [mail, { ...mail, id: "dependent", dependencies: ["mail"] }],
      { configVersion: 1, modules: { dependent: { enabled: true } } },
    ),
  );
});
test("revision is deterministic and public views cannot mutate the registry", () => {
  const registry = createRegistry([mail], {configVersion: 1, modules: {mail: {enabled: true}}});
  const view = registry.publicView();
  view.modules.mail = "disabled";
  assert.equal(registry.state("mail"), "enabled");
  assert.equal(
    registry.publicView().revision,
    createRegistry([mail], {configVersion: 1, modules: {mail: {enabled: true}}}).publicView().revision,
  );
  assert.notEqual(
    registry.publicView().revision,
    createRegistry([mail], { configVersion: 1, modules: {} }).publicView()
      .revision,
  );
});
test("unknown IDs and non-string states fail closed", () => {
  const registry = createRegistry([mail]);
  assert.equal(registry.state("constructor"), "disabled");
  assert.throws(() => registry.require("toString"), ModuleError);
  assert.throws(() =>
    createRegistry([mail], {
      configVersion: 1,
      modules: { mail: { state: ["enabled"] } },
    }),
  );
});
