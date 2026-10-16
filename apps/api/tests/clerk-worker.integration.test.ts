import { test, expect } from "bun:test";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { withDatabaseScope } from "@webdock/database-runtime";
import { createSetupFixture } from "./helpers/setup-fixture";
import { executeHosting } from "../src/modules/hosting/service";
import { workerDatabase } from "../src/db/runtime";
const enabled = process.env.WEBDOCK_RLS_FIXTURE_FILE;
(enabled ? test : test.skip)(
  "Clerk worker requires a fresh proof, enabled mapping and no legacy session",
  async () => {
    const url = new URL(process.env.API_TEST_OWNER_URL!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/webdock_rls_test")
      throw Error("Local fixture required");
    const db = new Pool({ connectionString: url.href, max: 1 }),
      f = await createSetupFixture(db),
      old = process.env.WEBDOCK_SETUP_ENABLED;
    process.env.WEBDOCK_SETUP_ENABLED = "true";
    try {
      const saved = await executeHosting(f.actor, {
        action: "setup.save",
        projectID: f.projectID,
        revision: 0,
        configuration: {
          name: "clerk-worker",
          source: { kind: "template", template: "healthcheck" },
          spec: {
            args: [],
            port: 8080,
            healthPath: "/ping",
            cpuMillicores: 100,
            memoryBytes: 67108864,
            ephemeralBytes: 67108864,
            replicas: 1,
          },
          database: { mode: "none" },
          mail: null,
          autoPublish: false,
        },
        idempotencyKey: randomUUID(),
      });
      const review = await executeHosting(f.actor, {
        action: "setup.preview",
        projectID: f.projectID,
        setupID: saved.id,
        revision: saved.revision,
      });
      await executeHosting(f.actor, {
        action: "setup.confirm",
        projectID: f.projectID,
        setupID: saved.id,
        revision: saved.revision,
        previewID: review.preview.id,
        acceptedOfferIDs: [],
        idempotencyKey: randomUUID(),
      });
      const org = (
        await db.query(
          "SELECT organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$1",
          [f.customerID],
        )
      ).rows[0].organization_id;
      const reference = {
        issuer: "https://fixture.clerk.accounts.dev",
        userID: "user_" + f.actor.subject,
        sessionID: "sess_" + f.actor.subject,
        organizationID: "org_" + org,
      };
      await db.query(
        "INSERT INTO webdock_auth.clerk_identity VALUES($1,$2,$3,true)",
        [reference.issuer, reference.userID, f.actor.subject],
      );
      await db.query(
        "INSERT INTO webdock_auth.clerk_organization VALUES($1,$2,$3,true)",
        [reference.issuer, reference.organizationID, org],
      );
      const actor = {
        ...f.actor,
        sessionID: reference.sessionID,
        consoleIdentity: reference,
      };
      const row = (
        await db.query(
          "UPDATE webdock_auth.hosting_setup SET actor=$2,generation=generation+1,lease_until=now()+interval '60 seconds' WHERE id=$1 RETURNING *",
          [saved.id, actor],
        )
      ).rows[0];
      await db.query("DELETE FROM webdock_auth.session WHERE id=$1", [
        f.actor.sessionID,
      ]);
      await db.query(
        'UPDATE webdock_auth."user" SET "twoFactorEnabled"=false,"emailVerified"=false,"mustChangePassword"=true WHERE id=$1',
        [f.actor.subject],
      );
      const scope = {
        kind: "system" as const,
        purpose: "hosting-setup",
        customerID: f.customerID,
        setupID: saved.id,
        generation: row.generation,
        clerk: {
          issuer: reference.issuer,
          userID: reference.userID,
          subject: f.actor.subject,
          sessionID: reference.sessionID,
          organizationID: org,
          clerkOrganizationID: reference.organizationID,
          customerID: f.customerID,
          role: "admin" as const,
          verifiedAt: Date.now(),
          expiresAt: Date.now() + 59000,
        },
      };
      const check = () =>
        workerDatabase.query(
          "SELECT webdock_rls.setup_allowed($1,$2) AS allowed",
          [f.customerID, f.projectID],
        );
      expect((await withDatabaseScope(scope, check)).rows[0].allowed).toBe(
        true,
      );
      expect(
        (
          await withDatabaseScope(
            { ...scope, clerk: { ...scope.clerk, expiresAt: 1 } },
            check,
          )
        ).rows[0].allowed,
      ).toBe(false);
      expect(
        (await withDatabaseScope({ ...scope, clerk: undefined }, check)).rows[0]
          .allowed,
      ).toBe(false);
      await db.query(
        "UPDATE webdock_auth.clerk_identity SET enabled=false WHERE user_id=$1",
        [f.actor.subject],
      );
      expect((await withDatabaseScope(scope, check)).rows[0].allowed).toBe(
        false,
      );
      // Exercise the real entry point in a process which has only worker credentials.
      const revalidationScope = { kind: "system" as const, purpose: "hosting-setup-revalidation", customerID: f.customerID, setupID: saved.id, generation: row.generation };
      const mapping = () => workerDatabase.query("SELECT webdock_rls.setup_clerk_revalidation($1,$2,$3,$4) AS mapping", [reference.issuer, reference.userID, reference.sessionID, reference.organizationID]);
      expect((await withDatabaseScope({ ...revalidationScope, customerID: "wrong-customer" }, mapping)).rows[0].mapping).toBeNull();
      expect((await withDatabaseScope(revalidationScope, () => workerDatabase.query("SELECT webdock_rls.setup_clerk_revalidation($1,$2,$3,$4) AS mapping", [reference.issuer, "user_wrong", reference.sessionID, reference.organizationID]))).rows[0].mapping).toBeNull();
      expect((await withDatabaseScope({ ...revalidationScope, generation: row.generation + 1 }, mapping)).rows[0].mapping).toBeNull();
      await db.query("UPDATE webdock_auth.hosting_setup SET lease_until=now()-interval '1 second' WHERE id=$1", [saved.id]);
      expect((await withDatabaseScope(revalidationScope, mapping)).rows[0].mapping).toBeNull();
      const child = async (status: string, mismatch = false) => {
        const env: NodeJS.ProcessEnv = { ...process.env, WEBDOCK_PROCESS_ROLE: "worker", WEBDOCK_SETUP_ENABLED: "true", CLERK_ISSUER: reference.issuer, WEBDOCK_CONSOLE_ORIGIN: "https://console.example.invalid", WEBDOCK_CONSOLE_SERVICE_KEY: "fixture-service-key-32-characters-long", CLERK_SECRET_KEY: "sk_test_fixture", CLERK_PUBLISHABLE_KEY: "pk_test_fixture" };
        for (const key of ["DATABASE_URL", "AUTH_DATABASE_URL", "API_TEST_OWNER_URL", "DATABASE_ADMIN_URL"]) delete env[key];
        const script = `
          import { mock } from "bun:test";
          mock.module("@clerk/backend", () => ({ createClerkClient: () => ({
            sessions: { getSession: async () => ({ id: ${JSON.stringify(reference.sessionID)}, userId: ${JSON.stringify(mismatch ? "user_wrong" : reference.userID)}, status: ${JSON.stringify(status)}, expireAt: Date.now()+60000 }) },
            users: {
              getUser: async () => ({ id: ${JSON.stringify(reference.userID)}, banned: false, locked: false, primaryEmailAddressId: "email", emailAddresses: [{ id: "email", verification: { status: "verified" } }] }),
              getOrganizationMembershipList: async () => ({ data: [{organization: {id: ${JSON.stringify(reference.organizationID)}}, role: "org:admin"}], totalCount: 1 })
            }
          }) }));
          const { runSetupBatch } = await import("./src/modules/hosting/setup-worker");
          const { closeDatabases } = await import("./src/db/runtime");
          try { console.log(JSON.stringify(await runSetupBatch({limit:1}))); } finally { await closeDatabases(); }
        `;
        const worker = Bun.spawn([process.execPath, "--no-env-file", "-e", script], { cwd: import.meta.dir + "/..", env, stdout: "pipe", stderr: "pipe" });
        const [output, errors, code] = await Promise.all([new Response(worker.stdout).text(), new Response(worker.stderr).text(), worker.exited]);
        expect(errors).toBe("");
        expect(code).toBe(0);
        return JSON.parse(output.trim());
      };
      const reset = async () => db.query("UPDATE webdock_auth.hosting_setup SET state='running',lease_until=NULL,next_attempt_at='1900-01-01',steps=$2,resources=$3 WHERE id=$1", [saved.id, JSON.stringify(row.steps), JSON.stringify(row.resources)]);
      await db.query("UPDATE webdock_auth.clerk_identity SET enabled=true WHERE user_id=$1", [f.actor.subject]);
      await reset();
      expect(await child("active")).toEqual({processed:1,failed:0});
      expect((await db.query("SELECT resources FROM webdock_auth.hosting_setup WHERE id=$1", [saved.id])).rows[0].resources.appID).toBeTruthy();
      await reset();
      expect(await child("revoked")).toEqual({processed:1,failed:1});
      await reset();
      expect(await child("active", true)).toEqual({processed:1,failed:1});
      await db.query("UPDATE webdock_auth.clerk_identity SET enabled=false WHERE user_id=$1", [f.actor.subject]);
      await reset();
      expect(await child("active")).toEqual({processed:1,failed:1});
    } finally {
      if (old === undefined) delete process.env.WEBDOCK_SETUP_ENABLED;
      else process.env.WEBDOCK_SETUP_ENABLED = old;
      await db.end();
    }
  },
);
