import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  registerHostingTools,
  validateHostingMCPToken,
} from "../src/lib/hosting-mcp";
import { validateMCPToken } from "../src/lib/mcp-auth";
import { HostingError } from "@webdock/hosting-contracts";
test("hosting claims never authenticate as operator Registry claims", () => {
  const token = {
    active: true,
    webdock_hosting: true,
    webdock_role: "hosting-operator",
    sub: "123",
    sid: "session",
    exp: Date.now() / 1000 + 60,
    iss: "https://auth.invalid",
    aud: "https://studio.invalid/api/mcp",
    token_type: "Bearer",
    scope: "hosting:read hosting:write",
  };
  assert.ok(validateHostingMCPToken(token, String(token.aud), token.iss));
  assert.equal(validateMCPToken(token, String(token.aud), token.iss), null);
  for (const bad of [
    { sid: "" },
    { exp: NaN },
    { scope: "hosting:read webdock:write" },
    { disabled: true },
    { webdock_hosting: false },
    { aud: "wrong" },
  ])
    assert.equal(
      validateHostingMCPToken(
        { ...token, ...bad },
        String(token.aud),
        token.iss,
      ),
      null,
    );
});
test("MCP exposes hosting tools only and uses shared service denials", async () => {
  for (const canWrite of [false, true]) {
    const server = new McpServer({ name: "test", version: "1" });
    registerHostingTools(
      server,
      async (cmd) => {
        if (cmd.action === "limits.set")
          throw new HostingError(403, "Platform operator access is required.");
        return { action: cmd.action };
      },
      canWrite,
    );
    const client = new Client({ name: "test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(a);
      await client.connect(b);
      const list = await client.listTools();
      assert.ok(list.tools.some((t) => t.name === "get_hosting_limits"));
      assert.equal(
        list.tools.some((t) => t.name === "set_hosting_limits"),
        canWrite,
      );
      assert.ok(
        !list.tools.some((t) =>
          ["list_records", "delete_project", "save_customer"].includes(t.name),
        ),
      );
      assert.ok(!list.tools.some(t=>t.name==='byok_mail_connect'),'Mail credentials must be entered in Studio, never passed to MCP');
      const read = await client.callTool({
        name: "get_hosting_limits",
        arguments: { customerID: "123" },
      });
      assert.equal(read.isError, undefined);
      if (canWrite) {
        const denied = await client.callTool({
          name: "set_hosting_limits",
          arguments: {
            customerID: "123",
            values: { apps: 2 },
            revision: 0,
            subscriptionRevision: 1,
          },
        });
        assert.equal(denied.isError, true);
      }
    } finally {
      await client.close();
      await server.close();
    }
  }
});
