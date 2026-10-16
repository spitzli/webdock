import { test, expect } from "bun:test";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import {
  withDatabaseScope,
  type DatabaseScope,
} from "@webdock/database-runtime";
import { createWorkerDatabases } from "../src/db/client";
import { createSetupFixture } from "./helpers/setup-fixture";
const integration = process.env.WEBDOCK_RLS_FIXTURE_FILE ? test : test.skip;
function fixturePools() {
  const url = new URL(process.env.API_TEST_OWNER_URL!);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/webdock_rls_test")
    throw Error("Owned local fixture required");
  return {
    owner: new Pool({ connectionString: url.href, max: 1 }),
    pools: createWorkerDatabases({
      environment: "development",
      workerURL: process.env.DATABASE_WORKER_URL!,
      signingSecret: process.env.DATABASE_RLS_SECRET,
      max: 1,
    }),
  };
}
integration(
  "Clerk worker identity reads are purpose-limited; session mappings require an exact admitted reference and never permit writes",
  async () => {
    const { owner, pools } = fixturePools();
    let id: string | undefined;
    try {
      id = (
        await owner.query(
          'INSERT INTO webdock_auth."user"(name,email,"emailVerified",role,"mustChangePassword") VALUES(\'Clerk worker fixture\',$1,true,\'user\',false) RETURNING id',
          [randomUUID() + "@example.invalid"],
        )
      ).rows[0].id;
      const issuer = "https://fixture.clerk.accounts.dev",
        subject = "user_" + randomUUID();
      await owner.query(
        "INSERT INTO webdock_auth.clerk_identity_mapping(issuer,external_subject,local_subject) VALUES($1,$2,$3)",
        [issuer, subject, id],
      );
      const sid = (
        await owner.query(
          'INSERT INTO webdock_auth.session("userId",token,"expiresAt","updatedAt") VALUES($1,$2,now()+interval \'1 hour\',now()) RETURNING id',
          [id, randomUUID()],
        )
      ).rows[0].id;
      await owner.query(
        "INSERT INTO webdock_auth.clerk_session_mapping(issuer,external_subject,external_session,local_session_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 hour')",
        [issuer, subject, "sess_" + randomUUID(), sid],
      );
      for (const purpose of [
        "mail-cron",
        "mail-send-gateway",
        "mail-webmail-gateway",
        "git-worker",
      ]) {
        const result = await withDatabaseScope(
          { kind: "system", purpose },
          () =>
            pools.worker.query(
              "SELECT issuer,external_subject,local_subject FROM webdock_auth.clerk_identity_mapping WHERE local_subject=$1",
              [id],
            ),
        );
        expect(result.rows.length).toBe(1);
        const sessions = await withDatabaseScope(
          { kind: "system", purpose },
          () =>
            pools.worker.query(
              "SELECT local_session_id FROM webdock_auth.clerk_session_mapping WHERE local_session_id=$1",
              [sid],
            ),
        );
        expect(sessions.rows).toEqual([]);
      }
      for (const purpose of [
        "api-scheduler",
        "agent",
        "agent-enrollment",
        "hosting-setup-dispatch",
        "database-order",
      ]) {
        const denied = await withDatabaseScope(
          { kind: "system", purpose },
          () =>
            pools.worker.query(
              "SELECT local_subject FROM webdock_auth.clerk_identity_mapping WHERE local_subject=$1",
              [id],
            ),
        );
        expect(denied.rows).toEqual([]);
      }
      const order: DatabaseScope = {
        kind: "system",
        purpose: "database-order",
        subject: id,
        sessionID: sid,
      };
      expect(
        (
          await withDatabaseScope(order, () =>
            pools.worker.query(
              "SELECT local_session_id FROM webdock_auth.clerk_session_mapping WHERE local_session_id=$1",
              [sid],
            ),
          )
        ).rows.length,
      ).toBe(1);
      expect(
        (
          await withDatabaseScope({ ...order, sessionID: "foreign" }, () =>
            pools.worker.query(
              "SELECT local_session_id FROM webdock_auth.clerk_session_mapping WHERE local_session_id=$1",
              [sid],
            ),
          )
        ).rows,
      ).toEqual([]);
      for (const purpose of [
        "mail-cron",
        "git-worker",
        "hosting-setup",
        "database-order",
      ]) {
        await expect(
          withDatabaseScope(
            { kind: "system", purpose, subject: id, sessionID: sid },
            () =>
              pools.worker.query(
                "UPDATE webdock_auth.clerk_identity_mapping SET revoked_at=now() WHERE local_subject=$1",
                [id],
              ),
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          withDatabaseScope(
            { kind: "system", purpose, subject: id, sessionID: sid },
            () =>
              pools.worker.query(
                "UPDATE webdock_auth.clerk_session_mapping SET expires_at=now() WHERE local_session_id=$1",
                [sid],
              ),
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          withDatabaseScope({ kind: "system", purpose }, () =>
            pools.worker.query(
              "SELECT token FROM webdock_auth.session WHERE id=$1",
              [sid],
            ),
          ),
        ).rejects.toMatchObject({ code: "42501" });
      }
    } finally {
      if (id)
        await owner.query('DELETE FROM webdock_auth."user" WHERE id=$1', [id]);
      await owner.end();
      await pools.close();
    }
  },
);
integration(
  "Clerk Hosting setup sees only its current leased actor mapping and loses it when generation or lease changes",
  async () => {
    const { owner, pools } = fixturePools();
    const f = await createSetupFixture(owner);
    try {
      const issuer = "https://fixture.clerk.accounts.dev",
        subject = "user_" + randomUUID();
      await owner.query(
        "INSERT INTO webdock_auth.clerk_identity_mapping(issuer,external_subject,local_subject) VALUES($1,$2,$3)",
        [issuer, subject, f.actor.subject],
      );
      await owner.query(
        "INSERT INTO webdock_auth.clerk_session_mapping(issuer,external_subject,external_session,local_session_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 hour')",
        [issuer, subject, "sess_" + randomUUID(), f.actor.sessionID],
      );
      const setupID = (
        await owner.query(
          `INSERT INTO webdock_auth.hosting_setup(customer_id,project_id,subject,actor,configuration,state,confirmed_preview_id,generation,lease_until) VALUES($1,$2,$3,$4,'{}','running',$5,1,now()+interval '1 minute') RETURNING id`,
          [
            f.customerID,
            f.projectID,
            f.actor.subject,
            JSON.stringify(f.actor),
            randomUUID(),
          ],
        )
      ).rows[0].id;
      const scope: DatabaseScope = {
        kind: "system",
        purpose: "hosting-setup",
        setupID,
        generation: 1,
        customerID: f.customerID,
      };
      const read = (s: DatabaseScope) =>
        withDatabaseScope(s, () =>
          pools.worker.query(
            "SELECT local_session_id FROM webdock_auth.clerk_session_mapping WHERE local_session_id=$1",
            [f.actor.sessionID],
          ),
        );
      expect((await read(scope)).rows.length).toBe(1);
      expect((await read({ ...scope, generation: 2 })).rows).toEqual([]);
      expect((await read({ ...scope, customerID: "foreign" })).rows).toEqual(
        [],
      );
      await owner.query(
        "UPDATE webdock_auth.hosting_setup SET lease_until=now()-interval '1 second' WHERE id=$1",
        [setupID],
      );
      expect((await read(scope)).rows).toEqual([]);
    } finally {
      await f.cleanup();
      await owner.end();
      await pools.close();
    }
  },
);
