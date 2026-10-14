import { test, expect } from "bun:test";
import { Pool } from "pg";
import { randomBytes, randomUUID } from "node:crypto";
const enabled = process.env.WEBDOCK_RLS_FIXTURE_FILE;
(enabled ? test : test.skip)(
  "billing connection requires live operator authority, masks secrets and locks organization after use",
  async () => {
    const url = new URL(process.env.API_TEST_OWNER_URL!);
    if (
      url.hostname !== "127.0.0.1" ||
      url.pathname !== "/webdock_rls_test" ||
      url.search
    )
      throw Error("Isolated fixture required");
    const db = new Pool({ connectionString: url.href, max: 1 });
    const base = BigInt(
      "99" + BigInt("0x" + randomBytes(4).toString("hex")).toString(),
    );
    const id = (n: number) => (base + BigInt(n)).toString();
    const user = id(1),
      sid = id(2),
      member = id(3),
      memberSid = id(4),
      customer = id(5),
      orgID = randomUUID();
    const actor = { subject: user, sessionID: sid };
    let productID: string | undefined, versionID: string | undefined;
    const versionIDs: string[] = [];
    const previousOrigin = process.env.WEBDOCK_API_ORIGIN;
    process.env.WEBDOCK_API_ORIGIN = "https://api.webdock.dev";
    const { connectionStatus, saveConnection, updateSwitches } =
      await import("../src/modules/billing/connection");
    const { databasePools } = await import("../src/db/runtime");
    try {
      if (
        (
          await db.query(
            "SELECT 1 FROM webdock_auth.billing_connection WHERE environment='sandbox'",
          )
        ).rowCount
      )
        throw Error("Use a fixture with no existing sandbox connection");
      for (const [subject, session, role] of [
        [user, sid, "operator"],
        [member, memberSid, "user"],
      ]) {
        await db.query(
          `INSERT INTO webdock_auth."user"(id,name,email,role,"emailVerified","mustChangePassword","twoFactorEnabled") VALUES($1,'Billing fixture',$2,$3,true,false,true)`,
          [subject, subject + "@example.invalid", role],
        );
        await db.query(
          `INSERT INTO webdock_auth.session(id,token,"userId","expiresAt","updatedAt") VALUES($1,$1,$2,now()+interval '1 hour',now())`,
          [session, subject],
        );
      }
      const input = {
          environment: "sandbox",
          revision: "0",
          token: "fixture-polar-token-do-not-expose",
        },
        probe = async () => ({ id: orgID, name: "Fixture" });
      let called = false;
      await expect(
        saveConnection(
          { subject: member, sessionID: memberSid },
          input,
          async () => {
            called = true;
            return probe();
          },
        ),
      ).rejects.toHaveProperty("status", 403);
      expect(called).toBe(false);
      const status = await saveConnection(actor, input, probe);
      expect(status.tokenSuffix).toBe("pose");
      expect(status.revision).toBe("1");
      expect(status.salesEnabled).toBe(false);
      expect(status.catalogPublishEnabled).toBe(false);
      expect(status.enforcementEnabled).toBe(false);
      expect(JSON.stringify(status)).not.toContain(input.token);
      expect(JSON.stringify(status)).not.toContain("encrypted");
      const stored = (
        await db.query(
          "SELECT encrypted_token FROM webdock_auth.billing_connection WHERE environment='sandbox'",
        )
      ).rows[0].encrypted_token;
      expect(stored).not.toContain(input.token);
      const attempts = await Promise.allSettled([
        saveConnection(actor, { ...input, revision: "1" }, probe),
        saveConnection(actor, { ...input, revision: "1" }, probe),
      ]);
      expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await connectionStatus(actor, "sandbox")).revision).toBe("2");
      await db.query(
        "UPDATE webdock_auth.billing_connection SET locked=true WHERE environment='sandbox'",
      );
      await expect(
        saveConnection(actor, { ...input, revision: "2" }, async () => ({
          id: randomUUID(),
          name: "Other",
        })),
      ).rejects.toHaveProperty("status", 409);
      await expect(
        updateSwitches(actor, {
          environment: "sandbox",
          revision: "2",
          salesEnabled: false,
          catalogPublishEnabled: false,
          enforcementEnabled: true,
        }),
      ).rejects.toThrow("Sandbox");
      await expect(
        saveConnection(actor, { ...input, revision: "2" }, async () => {
          await db.query(
            'UPDATE webdock_auth."user" SET "twoFactorEnabled"=false WHERE id=$1',
            [user],
          );
          return probe();
        }),
      ).rejects.toHaveProperty("status", 403);
      await db.query(
        'UPDATE webdock_auth."user" SET "twoFactorEnabled"=true WHERE id=$1',
        [user],
      );
      expect((await connectionStatus(actor, "sandbox")).revision).toBe("2");
      const { setupEndpoint } =
        await import("../src/modules/billing/endpoints");
      const { webhookEvents } = await import("../src/modules/billing/types");
      const endpoint = {
        id: randomUUID(),
        organization_id: orgID,
        url: "https://api.webdock.dev/webhooks/polar/sandbox",
        api_version: "2026-10",
        format: "raw",
        secret: "fixture-webhook-secret-at-least-32-characters",
        events: [...webhookEvents],
        enabled: true,
      };
      let created = false,
        creates = 0;
      const remote = {
        list: async () => (created ? [endpoint] : []),
        get: async () => endpoint,
        create: async () => {
          created = true;
          creates++;
          throw Error("Synthetic response lost after create");
        },
      };
      await expect(
        setupEndpoint(
          actor,
          { environment: "sandbox", revision: "2", mode: "create" },
          () => remote,
        ),
      ).rejects.toHaveProperty("status", 502);
      const recovered = await setupEndpoint(
        actor,
        { environment: "sandbox", revision: "2", mode: "create" },
        () => remote,
      );
      expect(creates).toBe(1);
      expect(recovered.endpointID).toBe(endpoint.id);
      expect(recovered.revision).toBe("3");
      expect(JSON.stringify(recovered)).not.toContain(endpoint.secret);
      endpoint.secret += "-rotated";
      const rotated = await setupEndpoint(
        actor,
        {
          environment: "sandbox",
          revision: "3",
          mode: "attach",
          endpointID: endpoint.id,
          secret: endpoint.secret,
        },
        () => remote,
      );
      expect(rotated.webhookVersion).toBe(2);
      expect(new Date(rotated.previousWebhookUntil).getTime()).toBeGreaterThan(
        Date.now(),
      );
      const { createProductVersion, publishProduct, setProductAvailability } =
        await import("../src/modules/billing/catalog");
      const draftInput = {
        sku: "fixture-" + user,
        name: "Fixture Website",
        visibility: "internal",
        operationallyReady: false,
        amount: 5880,
        currency: "EUR",
        taxBehavior: "inclusive",
        interval: "year",
        description: "Fixture annual website",
        terms: "Fixture annual agreement. Cancellation at period end.",
        entitlements: {
          websites: 1,
          editors: 1,
          mediaBytes: "500000000",
          mailMonthly: 100,
        },
      };
      const draft = await createProductVersion(actor, draftInput);
      versionIDs.push(draft.id);
      productID = draft.productId;
      versionID = draft.id;
      await expect(
        publishProduct(actor, { environment: "sandbox", versionID }),
      ).rejects.toHaveProperty("status", 409);
      await updateSwitches(actor, {
        environment: "sandbox",
        revision: "4",
        salesEnabled: false,
        catalogPublishEnabled: true,
        enforcementEnabled: false,
      });
      await expect(
        publishProduct(actor, { environment: "sandbox", versionID }, () => {
          throw Error("Unexpected provider access");
        }),
      ).rejects.toHaveProperty("status", 409);
      await setProductAvailability(actor, {
        productID,
        visibility: "private",
        operationallyReady: true,
      });
      let remoteProduct: Record<string, unknown> | undefined,
        publishes = 0,
        loseResponse = true;
      const catalogRemote = {
        find: async () => (remoteProduct ? [remoteProduct] : []),
        get: async () => remoteProduct,
        create: async (
          terms: import("../src/modules/billing/catalog-policy").PublishedTerms,
        ) => {
          publishes++;
          const pid = randomUUID();
          remoteProduct = {
            id: pid,
            organization_id: terms.organizationID,
            name: terms.name,
            description: terms.description,
            is_archived: false,
            is_recurring: true,
            recurring_interval: terms.interval,
            recurring_interval_count: 1,
            trial_interval: null,
            trial_interval_count: null,
            visibility: terms.visibility,
            metadata: {
              webdock_sku: terms.sku,
              webdock_version_id: terms.versionID,
              webdock_operation_id: terms.operationID,
              webdock_hash: terms.hash,
            },
            prices: [
              {
                id: randomUUID(),
                product_id: pid,
                source: "catalog",
                amount_type: "fixed",
                price_amount: terms.amount,
                price_currency: terms.currency.toLowerCase(),
                tax_behavior: terms.taxBehavior,
                is_archived: false,
              },
            ],
          };
          if (loseResponse)
            throw Error("Synthetic product create response lost");
          return remoteProduct;
        },
      };
      await expect(
        publishProduct(
          actor,
          { environment: "sandbox", versionID },
          () => catalogRemote,
        ),
      ).rejects.toHaveProperty("status", 502);
      const published = await publishProduct(
        actor,
        { environment: "sandbox", versionID },
        () => catalogRemote,
      );
      expect(published.productID).toBe(String(remoteProduct!.id));
      expect(publishes).toBe(1);
      const beforeAudit = (
        await db.query(
          "SELECT count(*)::int AS n FROM webdock_auth.access_event WHERE actor_id=$1 AND action='billing.version-published'",
          [user],
        )
      ).rows[0].n;
      expect(
        (
          await publishProduct(
            actor,
            { environment: "sandbox", versionID },
            () => catalogRemote,
          )
        ).productID,
      ).toBe(String(remoteProduct!.id));
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM webdock_auth.access_event WHERE actor_id=$1 AND action='billing.version-published'",
            [user],
          )
        ).rows[0].n,
      ).toBe(beforeAudit);
      const next = await createProductVersion(actor, {
        ...draftInput,
        visibility: "private",
        operationallyReady: true,
      });
      versionIDs.push(next.id);
      remoteProduct = undefined;
      loseResponse = false;
      const immediate = await publishProduct(
        actor,
        { environment: "sandbox", versionID: next.id },
        () => ({
          ...catalogRemote,
          get: async () => {
            throw Object.assign(Error("Read replica lag"), { statusCode: 404 });
          },
        }),
      );
      expect(immediate.productID).toBe(String(remoteProduct!.id));
      expect(publishes).toBe(2);
      await db.query(
        "INSERT INTO webdock_admin.customers(id,name,status) VALUES($1,'Preview billing','active')",
        [customer],
      );
      await db.query(
        "INSERT INTO webdock_auth.studio_tenant_preview(session_id,actor_id,customer_id,organization_id) SELECT $1,$2,$3::varchar,organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$3",
        [sid, user, customer],
      );
      await expect(connectionStatus(actor, "sandbox")).rejects.toHaveProperty(
        "status",
        403,
      );
    } finally {
      if (previousOrigin === undefined) delete process.env.WEBDOCK_API_ORIGIN;
      else process.env.WEBDOCK_API_ORIGIN = previousOrigin;
      await db.query(
        "DELETE FROM webdock_auth.billing_job WHERE environment='sandbox' AND dedupe_key=$1",
        ["endpoint:" + orgID],
      );
      for (const versionID of versionIDs) {
        await db.query(
          "DELETE FROM webdock_auth.billing_job WHERE environment='sandbox' AND dedupe_key=$1",
          ["publish:" + versionID],
        );
        const cleanup = await db.connect();
        try {
          await cleanup.query("BEGIN");
          await cleanup.query("SET LOCAL session_replication_role='replica'");
          await cleanup.query(
            "DELETE FROM webdock_auth.billing_product_mapping WHERE version_id=$1",
            [versionID],
          );
          await cleanup.query(
            "DELETE FROM webdock_auth.billing_product_version WHERE id=$1",
            [versionID],
          );

          await cleanup.query("COMMIT");
        } catch (error) {
          await cleanup.query("ROLLBACK");
          throw error;
        } finally {
          cleanup.release();
        }
      }
      if (productID)
        await db.query("DELETE FROM webdock_auth.billing_product WHERE id=$1", [
          productID,
        ]);
      await db.query(
        "DELETE FROM webdock_auth.billing_connection WHERE updated_by=$1",
        [user],
      );
      await db.query(
        "DELETE FROM webdock_auth.access_event WHERE actor_id=$1",
        [user],
      );
      await db.query(
        "DELETE FROM webdock_auth.studio_tenant_preview WHERE session_id=$1",
        [sid],
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
      await db.query("DELETE FROM webdock_auth.session WHERE id=ANY($1)", [
        [sid, memberSid],
      ]);
      await db.query('DELETE FROM webdock_auth."user" WHERE id=ANY($1)', [
        [user, member],
      ]);
      await db.end();
      await databasePools.close();
    }
  },
);
