import { test, expect } from "bun:test";
import { randomUUID } from "node:crypto";
import { billingFixture } from "./helpers/billing";
const enabled = process.env.WEBDOCK_RLS_FIXTURE_FILE;
(enabled ? test : test.skip)(
  "checkout binds current customer admin and immutable acceptance, recovers an unknown create without a second charge attempt",
  async () => {
    const f = await billingFixture(),
      { databasePools } = await import("../src/db/runtime");
    const { quotePurchase, createCheckout } =
      await import("../src/modules/billing/checkout");
    const input = {
      environment: "sandbox",
      customerID: f.customer,
      versionID: f.version,
      projectID: f.project,
      bindingID: f.binding,
    };
    let created = 0,
      remote: Record<string, unknown> | undefined;
    const provider = {
      find: async () => (remote ? [remote] : []),
      get: async () => remote,
      create: async (
        terms: import("../src/modules/billing/checkout-policy").CheckoutTerms,
      ) => {
        created++;
        remote = {
          id: randomUUID(),
          organization_id: terms.organizationID,
          external_customer_id: "webdock:" + terms.customerID,
          customer_id: null,
          status: "open",
          url: "https://sandbox.polar.sh/checkout/fixture-" + terms.operationID,
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          success_url: terms.successURL,
          return_url: terms.returnURL,
          product_id: terms.productID,
          product_price_id: terms.priceID,
          products: [{ id: terms.productID }],
          product: {
            id: terms.productID,
            recurring_interval: terms.interval,
            recurring_interval_count: 1,
          },
          product_price: {
            id: terms.priceID,
            product_id: terms.productID,
            amount_type: "fixed",
            price_amount: terms.amount,
            price_currency: terms.currency.toLowerCase(),
            tax_behavior: terms.taxBehavior,
          },
          allow_trial: false,
          active_trial_interval: null,
          active_trial_interval_count: null,
          trial_end: null,
          allow_discount_codes: false,
          discount_id: null,
          discount_amount: 0,
          currency: terms.currency.toLowerCase(),
          metadata: {
            webdock_contract_id: terms.contractID,
            webdock_operation_id: terms.operationID,
          },
        };
        throw Error("Synthetic checkout response lost");
      },
    };
    try {
      await expect(quotePurchase(f.otherActor, input)).rejects.toHaveProperty(
        "status",
        403,
      );
      await expect(quotePurchase(f.readerActor, input)).rejects.toHaveProperty(
        "status",
        403,
      );
      await f.owner.query(
        'UPDATE webdock_auth."oauthClient" SET disabled=true WHERE id=$1',
        [f.client],
      );
      await expect(quotePurchase(f.actor, input)).rejects.toHaveProperty(
        "status",
        409,
      );
      await f.owner.query(
        'UPDATE webdock_auth."oauthClient" SET disabled=false WHERE id=$1',
        [f.client],
      );
      const quote = await quotePurchase(f.actor, input);
      expect(quote.canAccept).toBe(true);
      expect(quote.amount).toBe("5880");
      await expect(
        createCheckout(
          f.actor,
          { ...input, acceptTerms: true, termsHash: "0".repeat(64) },
          async () => provider,
        ),
      ).rejects.toHaveProperty("status", 409);
      expect(created).toBe(0);
      const acceptance = {
        ...input,
        acceptTerms: true,
        termsHash: quote.termsHash,
      };
      await expect(
        createCheckout(f.actor, acceptance, async () => provider),
      ).rejects.toHaveProperty("status", 502);
      expect(created).toBe(1);
      const result = await createCheckout(
        f.actor,
        acceptance,
        async () => provider,
      );
      expect(result.url).toBe(String(remote!.url));
      expect(created).toBe(1);
      const repeat = await createCheckout(
        f.actor,
        acceptance,
        async () => provider,
      );
      expect(repeat.attemptID).toBe(result.attemptID);
      expect(created).toBe(1);
      expect(
        (
          await f.owner.query(
            "SELECT count(*)::int AS n FROM webdock_auth.billing_contract WHERE customer_id=$1",
            [f.customer],
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await f.owner.query(
            "SELECT count(*)::int AS n FROM webdock_auth.tenant_subscription WHERE customer_id=$1",
            [f.customer],
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await f.owner.query(
            "SELECT encrypted_url FROM webdock_auth.billing_checkout WHERE id=$1",
            [result.attemptID],
          )
        ).rows[0].encrypted_url,
      ).not.toContain(String(remote!.url));
      await f.owner.query('DELETE FROM webdock_auth.member WHERE "userId"=$1', [
        f.actor.subject,
      ]);
      await expect(
        createCheckout(f.actor, acceptance, async () => provider),
      ).rejects.toHaveProperty("status", 403);
    } finally {
      await f.cleanup();
      await databasePools.close();
    }
  },
);
