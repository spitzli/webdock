import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizePluginAction } from "./plugin-runtime-policy";
const policy: any = {
  state: "enabled",
  runtime: "ready",
  generation: 1,
  runtimeGeneration: 1,
  configurationRevision: 2,
  runtimeConfigurationRevision: 2,
  grantRevision: 3,
  revoked: false,
  approved: ["plugin.data.read", "plugin.http.read"],
  granted: ["plugin.data.read", "plugin.http.read"],
  actions: [
    {
      name: "stats",
      intent: "read",
      capabilities: ["plugin.data.read", "plugin.http.read"],
    },
  ],
  project: {
    id: "123",
    customerID: "456",
    active: true,
    allowed: true,
    canWrite: false,
    preview: false,
  },
};
test("requires exact approved action capabilities and live project grant", () => {
  assert.equal(authorizePluginAction(policy, "stats").name, "stats");
  for (const changes of [
    { state: "disabled" },
    { state: "draining" },
    { runtime: "failed" },
    { runtimeGeneration: 2 },
    { runtimeConfigurationRevision: 3 },
    { revoked: true },
    { granted: ["plugin.data.read"] },
    { approved: [] },
  ])
    assert.throws(() =>
      authorizePluginAction({ ...policy, ...changes }, "stats"),
    );
});
test("rejects unknown actions, tenant preview and unauthorized projects", () => {
  assert.throws(() => authorizePluginAction(policy, "other"));
  for (const changes of [
    { active: false },
    { allowed: false },
    { preview: true },
  ])
    assert.throws(() =>
      authorizePluginAction(
        { ...policy, project: { ...policy.project, ...changes } },
        "stats",
      ),
    );
});
test("membership alone cannot authorize a write", () => {
  const p = {
    ...policy,
    actions: [{ name: "save", intent: "write", capabilities: [] }],
  };
  assert.throws(() => authorizePluginAction(p, "save"));
  assert.equal(
    authorizePluginAction(
      { ...p, project: { ...p.project, canWrite: true } },
      "save",
    ).name,
    "save",
  );
});

test("project configuration overrides remain scoped and schema checked", async () => {
  const { resolvePluginConfiguration } =
    await import("./plugin-runtime-policy");
  const schema: any = {
    type: "object",
    properties: {
      analytics_origin: { type: "string" },
      tracking_origin: { type: "string" },
    },
    required: ["analytics_origin"],
    additionalProperties: false,
  };
  const base = { analytics_origin: "https://moon.example.com" };
  const overrides = { "123": { tracking_origin: "https://track.example.com" } };
  assert.deepEqual(resolvePluginConfiguration(schema, base, overrides, "123"), {
    ...base,
    ...overrides["123"],
  });
  assert.deepEqual(
    resolvePluginConfiguration(schema, base, overrides, "456"),
    base,
  );
  assert.throws(() =>
    resolvePluginConfiguration(
      schema,
      base,
      { "123": { provider_secret: "no" } },
      "123",
    ),
  );
});
test("website HTTP admission is explicit and cannot bypass authority for another service", () => {
  const action = {
    name: "cms.write",
    intent: "write",
    httpBinding: "cms",
    capabilities: ["plugin.http.request"],
  };
  const p = {
    ...policy,
    approved: ["plugin.http.request", "plugin.apps.provision"],
    granted: ["plugin.http.request", "plugin.apps.provision"],
    actions: [action],
  };
  assert.throws(() => authorizePluginAction(p as any, action.name));
  assert.equal(
    authorizePluginAction(p as any, action.name, { deferWebsiteHTTP: true })
      .name,
    action.name,
  );
  for (const capabilities of [
    [],
    ["plugin.apps.provision"],
    ["plugin.http.request", "plugin.apps.provision"],
  ])
    assert.throws(() =>
      authorizePluginAction(
        { ...p, actions: [{ ...action, capabilities }] } as any,
        action.name,
        { deferWebsiteHTTP: true },
      ),
    );
});
