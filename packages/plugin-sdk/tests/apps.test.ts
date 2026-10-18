import test from "node:test";
import assert from "node:assert/strict";
import * as contracts from "../src/contracts/index.js";
import { createPluginContext } from "../src/server/index.js";
test("apps capabilities, service and strict commands are available", () => {
  assert.ok(contracts.capabilities.includes("plugin.apps.read" as never));
  assert.ok(contracts.readCapabilities.includes("plugin.apps.read" as never));
  assert.ok(contracts.capabilities.includes("plugin.apps.manage" as never));
  assert.ok(contracts.serviceNames.includes("apps" as never));
  const schema = (contracts as any).managedAppCommandSchema;
  for (const operation of ["start", "stop", "restart"])
    assert.ok(
      schema.safeParse({
        app_id: "123",
        operation,
        revision: 1,
        subscription_revision: 2,
      }).success,
    );
  for (const operation of ["delete", "logs", "registry.configure"])
    assert.equal(
      schema.safeParse({
        app_id: "123",
        operation,
        revision: 1,
        subscription_revision: 2,
      }).success,
      false,
    );
  assert.equal(
    schema.safeParse({
      app_id: "123",
      operation: "stop",
      revision: 1,
      subscription_revision: 2,
      projectID: "9",
    }).success,
    false,
  );
});
test("apps uses authenticated POST and validates outputs", async () => {
  const calls: any[] = [];
  const app = {
    app_id: "123",
    name: "Tabularium",
    kind: "tabularium",
    status: "running",
    revision: 1,
    observed_revision: 1,
    subscription_revision: 2,
    operation_id: null,
    origin: "https://registry.example",
    console_path: "/hosting/apps/123",
  };
  const ctx = createPluginContext({
    hostURL: "https://host.example",
    token: () => "invocation",
    runtimeCredential: "runtime",
    fetch: (async (url: any, init: any) => {
      calls.push([url, init]);
      return Response.json({ apps: [app] });
    }) as typeof fetch,
  }) as any;
  assert.ok(ctx.apps);
  assert.deepEqual(await ctx.apps.list(), { apps: [app] });
  assert.equal(calls[0][0].pathname, "/v1/plugin/apps");
  assert.equal(calls[0][1].headers.Authorization, "Bearer invocation");
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    operation: "list",
    input: {},
  });
});
test("app origins are canonical and Hosting path identifies exactly the bound app", () => {
  const schema = contracts.managedAppOriginSchema;
  for (const value of [
    "https://registry.example/",
    "https://user:password@registry.example",
    "https://registry.example/path",
    "javascript:alert(1)",
  ])
    assert.equal(schema.safeParse(value).success, false);
  const app = {
    app_id: "123",
    name: "Registry",
    kind: "tabularium",
    status: "running",
    revision: 0,
    observed_revision: 0,
    subscription_revision: 0,
    operation_id: null,
    origin: "https://registry.example",
    console_path: "/hosting/apps/999",
  };
  assert.equal(contracts.managedAppSchema.safeParse(app).success, false);
});
test("approved template provisioning is strict, bounded and uses dedicated authority", async () => {
  assert.ok(contracts.capabilities.includes("plugin.apps.provision" as never));
  const input = {
    template_id: "approved-app",
    name: "My application",
    request_id: "request-1",
  };
  const schema = (contracts as any).managedAppProvisionSchema;
  assert.ok(schema.safeParse(input).success);
  for (const extra of [
    { image: "evil" },
    { project_id: "99" },
    { command: ["sh"] },
  ])
    assert.equal(schema.safeParse({ ...input, ...extra }).success, false);
  const status = {
    provisioning_id: "123",
    template_id: "approved-app",
    state: "running",
    steps: [{ name: "database", state: "running" }],
  };
  const calls: any[] = [];
  const ctx = createPluginContext({
    hostURL: "https://host.example",
    token: () => "token",
    fetch: (async (_url: any, init: any) => {
      calls.push(JSON.parse(init.body));
      return Response.json(status);
    }) as typeof fetch,
  });
  assert.deepEqual(await (ctx.apps as any).provision(input), status);
  assert.deepEqual(
    await (ctx.apps as any).provisioningStatus({ provisioning_id: "123" }),
    status,
  );
  assert.deepEqual(calls, [
    { operation: "provision", input },
    { operation: "provisioningStatus", input: { provisioning_id: "123" } },
  ]);
  assert.equal(
    (contracts as any).managedAppProvisioningSchema.safeParse({
      ...status,
      secret: "private",
    }).success,
    false,
  );
  assert.equal(
    (contracts as any).managedAppProvisioningSchema.safeParse({
      ...status,
      steps: Array(33).fill(status.steps[0]),
    }).success,
    false,
  );
});
test("provisioning discovery is read-only and bounded", async () => {
  assert.deepEqual(
    (contracts.hostMethodCatalog as any)["apps.provisioningList"],
    { version: 1, capability: "plugin.apps.read", intent: "read" },
  );
  const ctx = createPluginContext({
    hostURL: "https://host.example",
    token: () => "token",
    fetch: (async (_url: any, init: any) => {
      assert.deepEqual(JSON.parse(init.body), {
        operation: "provisioningList",
        input: {},
      });
      return Response.json({ provisionings: [] });
    }) as typeof fetch,
  });
  assert.deepEqual(await (ctx.apps as any).provisioningList(), {
    provisionings: [],
  });
});
