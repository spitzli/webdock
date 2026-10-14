import { test, expect } from "bun:test";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { withDatabaseScope } from "@webdock/database-runtime";
const enabled = process.env.WEBDOCK_RLS_FIXTURE_FILE;
(enabled ? test : test.skip)(
  "billing jobs retain claim ownership, bounded retries and environment isolation",
  async () => {
    const url = new URL(process.env.API_TEST_OWNER_URL!);
    if (
      url.hostname !== "127.0.0.1" ||
      url.pathname !== "/webdock_rls_test" ||
      url.search
    )
      throw Error("Isolated fixture required");
    const db = new Pool({ connectionString: url.href, max: 1 }),
      key = "fixture:" + randomUUID();
    const { claimBillingJob, completeBillingJob, failBillingJob } =
      await import("../src/modules/billing/jobs");
    const { databasePools } = await import("../src/db/runtime");
    try {
      await db.query(
        "INSERT INTO webdock_auth.billing_job(environment,kind,dedupe_key) VALUES('sandbox','catalog',$1),('live','catalog',$1)",
        [key],
      );
      const [a, b] = await Promise.all([
        claimBillingJob("sandbox"),
        claimBillingJob("sandbox"),
      ]);
      expect([a, b].filter(Boolean)).toHaveLength(1);
      const first = (a || b)!;
      await db.query(
        "UPDATE webdock_auth.billing_job SET lease_until=now()-interval '1 second' WHERE id=$1",
        [first.id],
      );
      const second = (await claimBillingJob("sandbox"))!;
      expect(second.claimToken).not.toBe(first.claimToken);
      expect(await completeBillingJob("sandbox", first)).toBe(false);
      expect(await completeBillingJob("live", second)).toBe(false);
      await failBillingJob("sandbox", second, {
        statusCode: 429,
        retryAfter: 600,
      });
      const retried = (
        await db.query(
          "SELECT status,available_at>now()+interval '9 minutes' AS delayed FROM webdock_auth.billing_job WHERE id=$1",
          [second.id],
        )
      ).rows[0];
      expect(retried.status).toBe("pending");
      expect(retried.delayed).toBe(true);
      await db.query(
        "UPDATE webdock_auth.billing_job SET attempts=7,available_at=now() WHERE id=$1",
        [second.id],
      );
      const final = (await claimBillingJob("sandbox"))!;
      await failBillingJob(
        "sandbox",
        final,
        Error("provider-secret-not-persisted"),
      );
      const failed = (
        await db.query(
          "SELECT status,error_code FROM webdock_auth.billing_job WHERE id=$1",
          [final.id],
        )
      ).rows[0];
      expect(failed).toEqual({
        status: "failed",
        error_code: "provider_unavailable",
      });
      expect(
        (
          await withDatabaseScope(
            { kind: "system", purpose: "polar:sandbox:dispatcher" },
            () =>
              databasePools.worker.query(
                "SELECT id FROM webdock_auth.billing_job WHERE environment='live' AND dedupe_key=$1",
                [key],
              ),
          )
        ).rowCount,
      ).toBe(0);
    } finally {
      await db.query(
        "DELETE FROM webdock_auth.billing_job WHERE dedupe_key=$1",
        [key],
      );
      await db.end();
      await databasePools.close();
    }
  },
);
