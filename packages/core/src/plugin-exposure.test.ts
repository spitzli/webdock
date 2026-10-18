import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pluginTools,
  pluginRoute,
  invokePluginExposure,
} from "./plugin-exposure";
const installed: any = {
  state: "enabled",
  runtime: "ready",
  manifest: {
    name: "managed-analytics",
    actions: [
      { name: "stats", intent: "read", capabilities: [] },
      { name: "provision", intent: "write", capabilities: [] },
    ],
    api: [
      { method: "GET", path: "/stats", action: "stats" },
      { method: "POST", path: "/site", action: "provision" },
    ],
    mcp: [
      { name: "stats", description: "Get stats", action: "stats" },
      { name: "provision", description: "Provision site", action: "provision" },
    ],
  },
};
test("namespaces tools and routes and filters writes for read-only callers", () => {
  assert.deepEqual(
    pluginTools([installed], false).map((t) => t.name),
    ["plugin__managed_analytics__stats"],
  );
  assert.equal(pluginTools([installed], true).length, 2);
  assert.equal(pluginRoute(installed, "GET", "/stats")?.name, "stats");
  assert.equal(pluginRoute(installed, "GET", "/site"), null);
});
test("disabled, draining or unhealthy plugins expose no new work", () => {
  for (const state of ["disabled", "draining"]) {
    const p = { ...installed, state };
    assert.deepEqual(pluginTools([p], true), []);
    assert.equal(pluginRoute(p, "GET", "/stats"), null);
  }
  assert.deepEqual(
    pluginTools([{ ...installed, runtime: "failed" }], true),
    [],
  );
});
test("rejects ambiguous tool namespace collisions", () => {
  assert.throws(() =>
    pluginTools(
      [
        installed,
        {
          ...installed,
          manifest: { ...installed.manifest, name: "managed_analytics" },
        },
      ],
      true,
    ),
  );
});
test("dispatch rechecks current installation, write scope and invokes the same action authority", async () => {
  let current = installed;
  const calls: any[] = [];
  const deps = {
    load: async () => current,
    invoke: async (...args: any[]) => {
      calls.push(args);
      return { ok: true };
    },
  };
  await invokePluginExposure(deps, {
    pluginID: "managed-analytics",
    projectID: "123",
    action: "stats",
    input: {},
    canWrite: false,
    idempotencyKey: "test",
  });
  assert.equal(calls.length, 1);
  await assert.rejects(() =>
    invokePluginExposure(deps, {
      pluginID: "managed-analytics",
      projectID: "123",
      action: "provision",
      input: {},
      canWrite: false,
      idempotencyKey: "test",
    }),
  );
  current = { ...installed, state: "disabled" };
  await assert.rejects(() =>
    invokePluginExposure(deps, {
      pluginID: "managed-analytics",
      projectID: "123",
      action: "stats",
      input: {},
      canWrite: true,
      idempotencyKey: "test",
    }),
  );
  assert.equal(calls.length, 1);
});
