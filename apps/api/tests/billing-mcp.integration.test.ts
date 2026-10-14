import { test, expect } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { billingFixture } from "./helpers/billing";
const enabled = process.env.WEBDOCK_RLS_FIXTURE_FILE;
(enabled ? test : test.skip)(
  "catalog MCP separates read/write scope and requires current operator authority before drafting or publishing",
  async () => {
    const f = await billingFixture();
    const { createRegistryMCP } = await import("../src/modules/mcp/mcp-server");
    const actor = {
      identity: f.actor,
      payload: {} as never,
      user: {
        id: f.actor.subject,
        name: "Fixture",
        email: "fixture@example.invalid",
        role: "operator",
        collection: "users" as const,
      },
    };
    const connect = async (write: boolean) => {
      const server = createRegistryMCP(actor, write),
        client = new Client({ name: "billing-fixture", version: "1" }),
        [a, b] = InMemoryTransport.createLinkedPair();
      await server.connect(a);
      await client.connect(b);
      return { server, client };
    };
    try {
      const read = await connect(false);
      try {
        const names = (await read.client.listTools()).tools.map((t) => t.name);
        expect(names).toContain("list_billing_product_versions");
        expect(names).not.toContain("create_billing_product_version");
        expect(names).not.toContain("publish_billing_product_version");
        expect(names).not.toContain("archive_billing_product_version");
      } finally {
        await read.client.close();
        await read.server.close();
      }
      const write = await connect(true);
      try {
        const denied = await write.client.callTool({
          name: "list_billing_product_versions",
          arguments: { environment: "sandbox" },
        });
        expect(denied.isError).toBe(true);
        await f.owner.query(
          `UPDATE webdock_auth."user" SET role='operator',"twoFactorEnabled"=true WHERE id=$1`,
          [f.actor.subject],
        );
        const draft = await write.client.callTool({
          name: "create_billing_product_version",
          arguments: {
            sku: "mcp-" + f.customer,
            name: "MCP website",
            visibility: "public",
            operationallyReady: true,
            amount: 490,
            currency: "EUR",
            taxBehavior: "inclusive",
            interval: "month",
            description: "Test catalog",
            terms: "Fixture terms",
            entitlements: {
              websites: 1,
              editors: 1,
              mediaBytes: "10000000",
              mailMonthly: 10,
            },
          },
        });
        expect(draft.isError).toBeUndefined();
        const version = JSON.parse(
          (draft.content as { text: string }[])[0].text,
        );
        f.extraProducts.push(version.productId);
        expect(version.frozen).toBe(false);
        const publication = await write.client.callTool({
          name: "publish_billing_product_version",
          arguments: { environment: "sandbox", versionID: version.id },
        });
        expect(publication.isError).toBe(true);
        expect(
          Number(
            (
              await f.owner.query(
                "SELECT count(*) AS n FROM webdock_auth.billing_product_mapping WHERE version_id=$1",
                [version.id],
              )
            ).rows[0].n,
          ),
        ).toBe(0);
        await f.owner.query(
          `UPDATE webdock_auth."user" SET "twoFactorEnabled"=false WHERE id=$1`,
          [f.actor.subject],
        );
        expect(
          (
            await write.client.callTool({
              name: "list_billing_product_versions",
              arguments: { environment: "sandbox" },
            })
          ).isError,
        ).toBe(true);
      } finally {
        await write.client.close();
        await write.server.close();
      }
    } finally {
      await f.cleanup();
      await (await import("../src/db/runtime")).databasePools.close();
      await (await import("../src/modules/registry/context")).closeRegistry();
    }
  },
);
