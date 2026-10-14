import { test, expect } from "bun:test";
import { Pool } from "pg";
import { randomUUID, createHmac } from "node:crypto";
import { sealBilling } from "../src/modules/billing/crypto";
const enabled = process.env.WEBDOCK_RLS_FIXTURE_FILE;
(enabled ? test : test.skip)(
  "Polar raw webhook verifies environment, commits inbox+job, deduplicates and quarantines hash conflicts",
  async () => {
    const url = new URL(process.env.API_TEST_OWNER_URL!);
    if (
      url.hostname !== "127.0.0.1" ||
      url.pathname !== "/webdock_rls_test" ||
      url.search
    )
      throw Error("Isolated fixture required");
    const db = new Pool({ connectionString: url.href, max: 1 }),
      key = "fixture-polar-webhook-secret-at-least-32",
      marker = randomUUID();
    const { receiveWebhook } = await import("../src/modules/billing/webhooks");
    const { databasePools } = await import("../src/db/runtime");
    const customer = (
        await db.query("SELECT webdock_auth.next_snowflake() AS id")
      ).rows[0].id as string,
      polarCustomer = randomUUID(),
      organization = randomUUID();
    const originalFetch = globalThis.fetch;
    const event = (type = "order.paid", api_version = "2026-10") =>
      JSON.stringify({
        type,
        api_version,
        timestamp: new Date().toISOString(),
        data: { id: randomUUID() },
      });
    const request = (body: string, id: string = marker, secret = key) => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      return new Request("https://api.webdock.dev/webhooks/polar/sandbox", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "webhook-id": id,
          "webhook-timestamp": timestamp,
          "webhook-signature":
            "v1," +
            createHmac("sha256", secret)
              .update(id + "." + timestamp + "." + body)
              .digest("base64"),
        },
        body,
      });
    };
    try {
      if (
        (
          await db.query(
            "SELECT 1 FROM webdock_auth.billing_connection WHERE environment='sandbox'",
          )
        ).rowCount
      )
        throw Error("Use an empty sandbox connection fixture");
      await db.query(
        "INSERT INTO webdock_auth.billing_connection(environment,encrypted_webhook_secret,webhook_version,updated_by) VALUES('sandbox',$1,1,$2)",
        [sealBilling(key, "sandbox", "webhook", 1), marker],
      );
      await db.query(
        "INSERT INTO webdock_admin.customers(id,name,status) VALUES($1,'Webhook fixture','active')",
        [customer],
      );
      await db.query(
        "INSERT INTO webdock_auth.billing_customer(environment,customer_id,polar_customer_id,is_test) VALUES('sandbox',$1,$2,true)",
        [customer, polarCustomer],
      );
      await db.query(
        "UPDATE webdock_auth.billing_connection SET encrypted_token=$1,token_version=1,organization_id=$2 WHERE environment='sandbox'",
        [
          sealBilling("fixture-polar-token-do-not-send", "sandbox", "token", 1),
          organization,
        ],
      );
      const body = event();
      expect(
        (await receiveWebhook("sandbox", request(body, marker, "incorrect")))
          .status,
      ).toBe(403);
      expect((await receiveWebhook("live", request(body))).status).toBe(503);
      expect(
        (await receiveWebhook("sandbox", request("x".repeat(1_048_577))))
          .status,
      ).toBe(413);
      expect((await receiveWebhook("sandbox", request("{"))).status).toBe(400);
      expect((await receiveWebhook("sandbox", request(body))).status).toBe(202);
      expect((await receiveWebhook("sandbox", request(body))).status).toBe(200);
      const receipt = (
        await db.query(
          "SELECT id,body_hash,encrypted_body,status FROM webdock_auth.billing_webhook_event WHERE event_id=$1",
          [marker],
        )
      ).rows[0];
      expect(receipt.encrypted_body).not.toContain("order.paid");
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM webdock_auth.billing_job WHERE event_id=$1",
            [receipt.id],
          )
        ).rows[0].n,
      ).toBe(1);
      expect((await receiveWebhook("sandbox", request(event()))).status).toBe(
        409,
      );
      const conflict = (
        await db.query(
          "SELECT status,body_hash,encrypted_body FROM webdock_auth.billing_webhook_event WHERE event_id=$1",
          [marker],
        )
      ).rows[0];
      expect(conflict.status).toBe("quarantined");
      expect(conflict.body_hash).toBe(receipt.body_hash);
      expect(conflict.encrypted_body).toBe(receipt.encrypted_body);
      const trigger = "billing_fixture_" + marker.replaceAll("-", "");
      try {
        await db.query(
          `CREATE FUNCTION webdock_auth.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.dedupe_key='event:${marker}-failure' THEN RAISE EXCEPTION 'fixture job insert unavailable';END IF;RETURN NEW;END $$`,
        );
        await db.query(
          `CREATE TRIGGER ${trigger} BEFORE INSERT ON webdock_auth.billing_job FOR EACH ROW EXECUTE FUNCTION webdock_auth.${trigger}()`,
        );
        expect(
          (
            await receiveWebhook(
              "sandbox",
              request(event(), marker + "-failure"),
            )
          ).status,
        ).toBe(503);
        expect(
          (
            await db.query(
              "SELECT count(*)::int AS n FROM webdock_auth.billing_webhook_event WHERE event_id=$1",
              [marker + "-failure"],
            )
          ).rows[0].n,
        ).toBe(0);
      } finally {
        await db.query(
          `DROP TRIGGER IF EXISTS ${trigger} ON webdock_auth.billing_job`,
        );
        await db.query(`DROP FUNCTION IF EXISTS webdock_auth.${trigger}()`);
      }
      await db.query(
        "UPDATE webdock_auth.billing_connection SET previous_webhook_secret=encrypted_webhook_secret,previous_webhook_version=1,previous_webhook_until=now()+interval '24 hours',encrypted_webhook_secret=$1,webhook_version=2 WHERE environment='sandbox'",
        [sealBilling(key + "-rotated", "sandbox", "webhook", 2)],
      );
      expect((await receiveWebhook("sandbox", request(body))).status).toBe(200);
      await db.query(
        "UPDATE webdock_auth.billing_connection SET previous_webhook_until=now()-interval '1 second' WHERE environment='sandbox'",
      );
      expect((await receiveWebhook("sandbox", request(body))).status).toBe(403);
      await db.query(
        "UPDATE webdock_auth.billing_connection SET previous_webhook_until=now()+interval '24 hours' WHERE environment='sandbox'",
      );
      const customerEvent = JSON.stringify({
        type: "customer.state_changed",
        api_version: "2026-10",
        timestamp: new Date().toISOString(),
        data: { id: polarCustomer, active_subscriptions: [] },
      });
      expect(
        (
          await receiveWebhook(
            "sandbox",
            request(customerEvent, marker + "-customer"),
          )
        ).status,
      ).toBe(202);
      let reads = 0;
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        );
        if (
          url.origin !== "https://sandbox-api.polar.sh" ||
          !url.pathname.endsWith("/customers/" + polarCustomer)
        )
          throw Error("Unexpected provider request");
        reads++;
        return Response.json({
          id: polarCustomer,
          organization_id: organization,
          external_id: "webdock:" + customer,
        });
      }) as typeof fetch;
      const { claimBillingJob } = await import("../src/modules/billing/jobs");
      const { dispatchWebhook } =
        await import("../src/modules/billing/dispatch");
      const claimed = (await claimBillingJob("sandbox"))!;
      expect(claimed.kind).toBe("webhook");
      expect(await dispatchWebhook("sandbox", claimed)).toBe(true);
      expect(reads).toBe(1);
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM webdock_auth.billing_job WHERE environment='sandbox' AND customer_id=$1 AND kind='reconcile'",
            [customer],
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await db.query(
            "SELECT status FROM webdock_auth.billing_webhook_event WHERE event_id=$1",
            [marker + "-customer"],
          )
        ).rows[0].status,
      ).toBe("processed");
      expect(
        (
          await receiveWebhook(
            "sandbox",
            request(event("future.event", "2027-01"), marker + "-future"),
          )
        ).status,
      ).toBe(202);
      expect(
        (
          await db.query(
            "SELECT status FROM webdock_auth.billing_webhook_event WHERE event_id=$1",
            [marker + "-future"],
          )
        ).rows[0].status,
      ).toBe("quarantined");
    } finally {
      globalThis.fetch = originalFetch;
      await db.query(
        "DELETE FROM webdock_auth.billing_job WHERE customer_id=$1",
        [customer],
      );
      await db.query(
        "DELETE FROM webdock_auth.billing_job WHERE event_id IN (SELECT id FROM webdock_auth.billing_webhook_event WHERE event_id=ANY($1))",
        [[marker, marker + "-future", marker + "-customer"]],
      );
      await db.query(
        "DELETE FROM webdock_auth.billing_webhook_event WHERE event_id=ANY($1)",
        [[marker, marker + "-future", marker + "-customer"]],
      );
      await db.query(
        "DELETE FROM webdock_auth.billing_connection WHERE updated_by=$1",
        [marker],
      );
      await db.query(
        "DELETE FROM webdock_auth.billing_customer WHERE customer_id=$1",
        [customer],
      );
      const orgs = (
        await db.query(
          "DELETE FROM webdock_auth.tenant_customer WHERE customer_id=$1 RETURNING organization_id",
          [customer],
        )
      ).rows.map((row) => row.organization_id);
      await db.query("DELETE FROM webdock_admin.customers WHERE id=$1", [
        customer,
      ]);
      await db.query("DELETE FROM webdock_auth.organization WHERE id=ANY($1)", [
        orgs,
      ]);
      await db.end();
      await databasePools.close();
    }
  },
);
