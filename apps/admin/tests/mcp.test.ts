import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createRegistryMCP } from "../src/lib/mcp-server";
import { validateMCPToken } from "../src/lib/mcp-auth";
import { customerInput, projectInput, instanceInput, listInput, writeCustomer, type RegistryActor } from "../src/lib/registry";
const resource = "https://studio.webdock.dev/api/mcp", issuer = "https://auth.webdock.dev/api/auth";
test("MCP accepts only current operator bearer claims for its exact issuer and resource", () => {
  const valid = { active: true, disabled: false, webdock_role: "operator", iss: issuer, aud: resource, sub: "123", exp: Date.now() / 1000 + 60, scope: "webdock:read", token_type: "Bearer" };
  assert.equal(validateMCPToken(valid, resource, issuer)?.subject, "123");
  for (const patch of [{ active: false }, { disabled: true }, { webdock_role: "admin" }, { iss: "https://attacker.invalid" }, { aud: "https://webdock.dev" }, { exp: 1 }, { sub: undefined }, { token_type: "DPoP" }]) assert.equal(validateMCPToken({ ...valid, ...patch }, resource, issuer), null);
});
test("Registry validates IDs, URLs, bounds and rejects unknown privilege fields", () => {
  assert.throws(() => customerInput.parse({ name: "Fine", role: "operator" }));
  assert.throws(() => projectInput.parse({ name: "Fine", customer: "1e20" }));
  assert.throws(() => projectInput.parse({ name: "Fine", customer: "123", url: "https://secret:password@example.org" }));
  assert.throws(() => instanceInput.parse({ project: "123", label: "Site", adminURL: "http://localhost", schemaName: "public; DROP", providerProjectID: "a", provider: "vercel", template: "custom", status: "active" }));
  assert.throws(() => listInput.parse({ collection: "users" }));
  assert.throws(() => listInput.parse({ collection: "projects", limit: 10000 }));
});
test("MCP read/write scopes change available tools, writes retain access checks and actor", async () => {
  const calls: Record<string, unknown>[] = [];
  const actor = { user: { id: "123", collection: "users", role: "operator" }, payload: { create: async (args: Record<string, unknown>) => { calls.push(args); return { id: "456", ...(args.data as object) }; } } } as unknown as RegistryActor;
  await assert.rejects(writeCustomer({ ...actor, user: { ...actor.user, role: "admin" } }, null, { name: "Denied" }));
  for (const write of [false, true]) {
    const server = createRegistryMCP(actor, write);
    const client = new Client({ name: "test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a); await client.connect(b);
    try {
      const tools = await client.listTools();
      assert.equal(tools.tools.some(t => t.name === "save_customer"), write);
      const result = await client.callTool({ name: "save_customer", arguments: { data: { name: "Test" } } });
      assert.equal(Boolean(result.isError), !write);
    } finally { await client.close(); await server.close(); }
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].overrideAccess, false);
  assert.equal(calls[0].user, actor.user);
  assert.deepEqual(calls[0].data, { name: "Test", status: "active" });
});
