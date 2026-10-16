import { test, expect } from "bun:test";
import { billingFixture } from "./helpers/billing";
const enabled = process.env.WEBDOCK_RLS_FIXTURE_FILE;
(enabled ? test : test.skip)(
  "private billing offers stay customer-specific and expire without starting checkout or creating templates",
  async () => {
    const f = await billingFixture(),
      { databasePools } = await import("../src/db/runtime");
    const { createOffer, getBillingOffer, revokeOffer } =
      await import("../src/modules/billing/offers");
    const { quotePurchase, createCheckout } =
      await import("../src/modules/billing/checkout");
    try {
      await f.owner.query(
        "UPDATE webdock_auth.billing_product SET visibility='private' WHERE id=$1",
        [f.product],
      );
      await f.owner.query(
        `UPDATE webdock_auth."user" SET role='operator' WHERE id=$1`,
        [f.actor.subject],
      );
      const input = {
        environment: "sandbox",
        customerID: f.customer,
        versionID: f.version,
        days: 1,
      };
      await expect(createOffer(f.actor, input)).rejects.toHaveProperty(
        "status",
        403,
      );
      await f.owner.query(
        `UPDATE webdock_auth."user" SET "twoFactorEnabled"=true WHERE id=$1`,
        [f.actor.subject],
      );
      const count = (
        await f.owner.query(
          "SELECT count(*)::integer AS n FROM webdock_auth.plan_template",
        )
      ).rows[0].n;
      const offer = await createOffer(f.actor, input),
        token = new URL(offer.url).pathname.split("/").at(-1)!;
      expect(token).toMatch(/^billing\.[A-Za-z0-9_-]{43}$/);
      expect(
        (
          await f.owner.query(
            "SELECT token_hash FROM webdock_auth.billing_offer WHERE id=$1",
            [offer.id],
          )
        ).rows[0].token_hash,
      ).not.toContain(token);
      await expect(getBillingOffer(f.otherActor, token)).rejects.toHaveProperty(
        "status",
        404,
      );
      await expect(
        getBillingOffer(f.readerActor, token),
      ).rejects.toHaveProperty("status", 404);
      await f.owner.query(
        "INSERT INTO webdock_auth.studio_tenant_preview(session_id,actor_id,customer_id,organization_id) SELECT $1,$2,$3::varchar,organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$3",
        [f.actor.sessionID, f.actor.subject, f.customer],
      );
      await expect(getBillingOffer(f.actor, token)).rejects.toHaveProperty(
        "status",
        404,
      );
      await f.owner.query(
        "DELETE FROM webdock_auth.studio_tenant_preview WHERE session_id=$1",
        [f.actor.sessionID],
      );
      await f.owner.query(
        `UPDATE webdock_auth."user" SET role='user',"twoFactorEnabled"=false WHERE id=$1`,
        [f.actor.subject],
      );
      expect((await getBillingOffer(f.actor, token)).status).toBe("pending");
      const purchase = {
        environment: "sandbox",
        customerID: f.customer,
        versionID: f.version,
        projectID: f.project,
        bindingID: f.binding,
        offerToken: token,
      };
      const quote = await quotePurchase(f.actor, purchase);
      expect(quote.canAccept).toBe(true);
      const owner = await f.owner.connect();
      try {
        await owner.query("BEGIN");
        await owner.query("SET LOCAL session_replication_role='replica'");
        await owner.query(
          "UPDATE webdock_auth.billing_offer SET expires_at=now()-interval '1 second' WHERE id=$1",
          [offer.id],
        );
        await owner.query("COMMIT");
      } catch (error) {
        await owner.query("ROLLBACK");
        throw error;
      } finally {
        owner.release();
      }
      expect((await getBillingOffer(f.actor, token)).status).toBe("expired");
      let called = false;
      await expect(
        createCheckout(
          f.actor,
          { ...purchase, termsHash: quote.termsHash, acceptTerms: true },
          async () => {
            called = true;
            throw Error("Unexpected provider request");
          },
        ),
      ).rejects.toHaveProperty("status", 409);
      expect(called).toBe(false);
      await f.owner.query(
        `UPDATE webdock_auth."user" SET role='operator',"twoFactorEnabled"=true WHERE id=$1`,
        [f.actor.subject],
      );
      await revokeOffer(f.actor, offer.id);
      expect(
        (
          await f.owner.query(
            "SELECT status FROM webdock_auth.billing_offer WHERE id=$1",
            [offer.id],
          )
        ).rows[0].status,
      ).toBe("revoked");
      expect(
        (
          await f.owner.query(
            "SELECT count(*)::integer AS n FROM webdock_auth.plan_template",
          )
        ).rows[0].n,
      ).toBe(count);
    } finally {
      await f.cleanup();
      await databasePools.close();
    }
  },
);
