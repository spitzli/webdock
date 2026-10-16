import { test, expect } from "bun:test";
import { randomUUID } from "node:crypto";
import { billingFixture } from "./helpers/billing";
import { sealBilling } from "../src/modules/billing/crypto";
const enabled = process.env.WEBDOCK_RLS_FIXTURE_FILE;
(enabled ? test : test.skip)(
  "payment portal uses only the stored customer and rechecks access before returning its uncached URL",
  async () => {
    const f = await billingFixture(),
      { databasePools } = await import("../src/db/runtime"),
      { createCustomerPortal } = await import("../src/modules/billing/portal");
    const original = globalThis.fetch,
      polarCustomer = randomUUID();
    let calls = 0,
      sessions = 0,
      unsafe = true,
      revoke = false;
    try {
      await f.owner.query(
        "UPDATE webdock_auth.billing_customer SET polar_customer_id=$1 WHERE environment='sandbox' AND customer_id=$2",
        [polarCustomer, f.customer],
      );
      await f.owner.query(
        "UPDATE webdock_auth.billing_connection SET encrypted_token=$1,token_version=1 WHERE environment='sandbox'",
        [sealBilling("fixture-polar-token-do-not-send", "sandbox", "token", 1)],
      );
      globalThis.fetch = (async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        calls++;
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        );
        if (url.origin !== "https://sandbox-api.polar.sh")
          throw Error("Unexpected provider origin");
        if (url.pathname.endsWith("/customers/" + polarCustomer))
          return Response.json({
            id: polarCustomer,
            organization_id: f.organization,
            external_id: "webdock:" + f.customer,
          });
        if (url.pathname.endsWith("/organizations/" + f.organization))
          return Response.json({
            id: f.organization,
            customer_portal_settings: {
              subscription: {
                update_plan: unsafe,
                update_seats: false,
                update_units: false,
                pause: false,
              },
            },
          });
        if (url.pathname.replace(/\/$/, "").endsWith("/customer-sessions")) {
          sessions++;
          const body = JSON.parse(String(init?.body));
          expect(body.customer_id).toBe(polarCustomer);
          expect(new URL(body.return_url).searchParams.get("environment")).toBe(
            "sandbox",
          );
          expect(body.external_customer_id).toBeUndefined();
          if (revoke)
            await f.owner.query(
              'DELETE FROM webdock_auth.member WHERE "userId"=$1',
              [f.actor.subject],
            );
          return Response.json({
            id: randomUUID(),
            token: "private-fixture-session",
            customer_id: polarCustomer,
            customer: { organization_id: f.organization },
            customer_portal_url:
              "https://sandbox.polar.sh/fixture/portal?customer_session_token=private-fixture-session",
            expires_at: new Date(Date.now() + 3600000).toISOString(),
            return_url: body.return_url,
          });
        }
        throw Error("Unexpected provider endpoint");
      }) as typeof fetch;
      const input = { environment: "sandbox", customerID: f.customer };
      await expect(
        createCustomerPortal(f.otherActor, input),
      ).rejects.toHaveProperty("status", 403);
      await expect(
        createCustomerPortal(f.readerActor, input),
      ).rejects.toHaveProperty("status", 403);
      expect(calls).toBe(0);
      await expect(createCustomerPortal(f.actor, input)).rejects.toHaveProperty(
        "status",
        409,
      );
      expect(sessions).toBe(0);
      unsafe = false;
      const result = await createCustomerPortal(f.actor, input);
      expect(result.url).toStartWith("https://sandbox.polar.sh/");
      expect(Object.keys(result).sort()).toEqual(["expiresAt", "url"]);
      expect(sessions).toBe(1);
      revoke = true;
      await expect(createCustomerPortal(f.actor, input)).rejects.toHaveProperty(
        "status",
        403,
      );
      expect(sessions).toBe(2);
    } finally {
      globalThis.fetch = original;
      await f.cleanup();
      await databasePools.close();
    }
  },
);
