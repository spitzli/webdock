import { test, expect, afterAll } from "bun:test";
import { randomUUID } from "node:crypto";
import { billingFixture } from "./helpers/billing";
import { sealBilling } from "../src/modules/billing/crypto";
const enabled = process.env.WEBDOCK_RLS_FIXTURE_FILE;
afterAll(async () => {
  if (enabled) await (await import("../src/db/runtime")).databasePools.close();
});
(enabled ? test : test.skip)(
  "real SDK writes use organization-token authority without forbidden organization_id body fields",
  async () => {
    const f = await billingFixture(),
      original = globalThis.fetch,
      origin = process.env.WEBDOCK_API_ORIGIN;
    process.env.WEBDOCK_API_ORIGIN = "https://api.webdock.dev";
    const bodies: Record<string, unknown>[] = [];
    let endpoint: any, product: any;
    let archives = 0;
    try {
      await f.owner.query(
        `UPDATE webdock_auth."user" SET role='operator',"twoFactorEnabled"=true WHERE id=$1`,
        [f.actor.subject],
      );
      await f.owner.query(
        "UPDATE webdock_auth.billing_connection SET encrypted_token=$1,token_version=1,checked_at=now(),catalog_publish_enabled=true WHERE environment='sandbox'",
        [sealBilling("synthetic-organization-token", "sandbox", "token", 1)],
      );
      globalThis.fetch = (async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const url = new URL(
            input instanceof Request ? input.url : String(input),
          ),
          method = init?.method || "GET";
        if (url.origin !== "https://sandbox-api.polar.sh")
          throw Error("Unexpected provider origin");
        if (method === "POST") {
          const body = JSON.parse(String(init?.body));
          bodies.push(body);
          if (url.pathname === "/v1/webhooks/endpoints") {
            endpoint = {
              ...body,
              id: randomUUID(),
              organization_id: f.organization,
              secret: "synthetic-webhook-secret-only",
              enabled: true,
            };
            return Response.json(endpoint);
          }
          if (url.pathname === "/v1/products/") {
            product = {
              ...body,
              id: randomUUID(),
              organization_id: f.organization,
              is_archived: false,
              is_recurring: true,
              prices: body.prices.map((p: any) => ({
                ...p,
                id: randomUUID(),
                product_id: "pending",
                source: "catalog",
                is_archived: false,
              })),
            };
            product.prices.forEach((p: any) => (p.product_id = product.id));
            return Response.json(product);
          }
        }
        if (
          method === "PATCH" &&
          product &&
          url.pathname === "/v1/products/" + product.id
        ) {
          archives++;
          product.is_archived = true;
          throw Error("Lost archive response");
        }
        if (method === "GET") {
          if (
            endpoint &&
            url.pathname === "/v1/webhooks/endpoints/" + endpoint.id
          )
            return Response.json(endpoint);
          if (product && url.pathname === "/v1/products/" + product.id)
            return Response.json(product);
          return Response.json({
            items: [],
            pagination: { total_count: 0, max_page: 1 },
          });
        }
        throw Error("Unexpected SDK request");
      }) as typeof fetch;
      await (
        await import("../src/modules/billing/endpoints")
      ).setupEndpoint(f.actor, {
        environment: "sandbox",
        revision: "0",
        mode: "create",
      });
      const { createProductVersion, publishProduct } =
        await import("../src/modules/billing/catalog");
      const draft = await createProductVersion(f.actor, {
        sku: "sdk-" + f.customer,
        name: "SDK contract",
        visibility: "public",
        operationallyReady: true,
        amount: 100,
        currency: "EUR",
        taxBehavior: "inclusive",
        interval: "month",
        description: "SDK fixture",
        terms: "Synthetic terms",
        entitlements: {
          websites: 1,
          editors: 1,
          mediaBytes: "10000000",
          mailMonthly: 0,
        },
      });
      f.extraProducts.push(draft.productId);
      await publishProduct(f.actor, {
        environment: "sandbox",
        versionID: draft.id,
      });
      expect(bodies).toHaveLength(2);
      for (const body of bodies)
        expect(body).not.toHaveProperty("organization_id");
      const { archiveProduct } = await import("../src/modules/billing/catalog");
      await expect(
        archiveProduct(f.actor, {
          environment: "sandbox",
          versionID: draft.id,
        }),
      ).rejects.toHaveProperty("status", 502);
      expect(
        (
          await archiveProduct(f.actor, {
            environment: "sandbox",
            versionID: draft.id,
          })
        ).status,
      ).toBe("archived");
      expect(archives).toBe(1);
      await expect(
        archiveProduct(f.otherActor, {
          environment: "sandbox",
          versionID: draft.id,
        }),
      ).rejects.toHaveProperty("status", 403);
      await expect(
        publishProduct(f.actor, {
          environment: "sandbox",
          versionID: draft.id,
        }),
      ).rejects.toHaveProperty("status", 409);

      expect(
        (
          await f.owner.query(
            "SELECT status,error_code FROM webdock_auth.billing_product_mapping WHERE environment='sandbox' AND version_id=$1",
            [draft.id],
          )
        ).rows[0],
      ).toEqual({ status: "archived", error_code: null });
    } finally {
      globalThis.fetch = original;
      if (origin === undefined) delete process.env.WEBDOCK_API_ORIGIN;
      else process.env.WEBDOCK_API_ORIGIN = origin;
      await f.cleanup();
    }
  },
);
