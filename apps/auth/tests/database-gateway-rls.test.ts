import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { withDatabaseScope } from "@webdock/database-runtime";
import type { HostingActor } from "@webdock/hosting-contracts";
const fixtureFile = process.env.WEBDOCK_RLS_FIXTURE_FILE;
test(
  "strict database roles preserve launch exchange, runtime profile, inspection and revocation",
  { skip: !fixtureFile },
  async () => {
    const ownerURL = process.env.DATABASE_URL!,
      url = new URL(ownerURL);
    assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
    assert.equal(url.pathname, "/webdock_rls_test");
    const fixture = JSON.parse(readFileSync(fixtureFile!, "utf8"));
    Object.assign(process.env, {
      DATABASE_URL: fixture.roles.webdock_auth_runtime,
      AUTH_DATABASE_URL: fixture.roles.webdock_auth_bootstrap,
      DATABASE_WORKER_URL: fixture.roles.webdock_worker_runtime,
      DATABASE_RLS_SECRET: fixture.contextSecret,
      BETTER_AUTH_SECRET: "synthetic-gateway-rls-".repeat(3),
      WEBDOCK_DATABASE_GATEWAY_SECRET: "synthetic-gateway-secret-".repeat(3),
      WEBDOCK_DATABASE_GATEWAY_ORIGIN: "https://gateway.rls.invalid",
    });
    const { database, authDatabase, workerDatabase } =
      await import("../src/lib/db");
    const { executeDatabase, exchangeLaunch, inspectSession } =
      await import("../src/lib/databases/service");
    const { databaseGateway } = await import("../src/lib/databases/http");
    const { transaction } = await import("../src/lib/hosting/db");
    const { encryptMailSecret } = await import("../src/lib/platform");
    const owner = new pg.Pool({ connectionString: ownerURL, max: 1 });
    const base = BigInt(
        "94" + BigInt("0x" + randomBytes(5).toString("hex")).toString(),
      ),
      id = (i: number) => (base + BigInt(i)).toString();
    const customer = id(0),
      subject = id(1),
      session = id(2),
      project = id(3),
      binding = id(4),
      grant = id(5),
      origin = "https://runtime-" + subject + ".rls.invalid",
      connection = "platform-own-site",
      proxySecret = "synthetic-proxy-secret-".repeat(3);
    const actor: HostingActor = {
      subject,
      sessionID: session,
      source: "studio",
      scopes: ["hosting:read", "hosting:write"],
    };
    const user = <T>(run: () => T) =>
      withDatabaseScope({ kind: "session", subject, sessionID: session }, run);
    const broker = <T>(run: () => T) =>
      withDatabaseScope({ kind: "system", purpose: "database-gateway" }, run);
    const open = () =>
      user(() =>
        transaction((db) =>
          executeDatabase(db, actor, { action: "open", bindingID: binding }),
        ),
      ) as Promise<{ code: string }>;
    const http = (
      body: unknown,
      credential = process.env.WEBDOCK_DATABASE_GATEWAY_SECRET,
    ) =>
      databaseGateway(
        new Request("https://auth.rls.invalid/api/databases/gateway", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + credential,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      );
    let org: string | undefined;
    try {
      await owner.query(
        'INSERT INTO webdock_auth."user"(id,name,email,role,"emailVerified","mustChangePassword","twoFactorEnabled") VALUES($1,$1,$2,\'user\',true,false,false)',
        [subject, subject + "@rls.invalid"],
      );
      await owner.query(
        'INSERT INTO webdock_auth.session(id,token,"userId","expiresAt","updatedAt") VALUES($1,$1,$2,now()+interval \'1 hour\',now())',
        [session, subject],
      );
      await owner.query(
        "INSERT INTO webdock_admin.customers(id,name,status) VALUES($1,$1,'active')",
        [customer],
      );
      org = (
        await owner.query(
          "SELECT organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$1",
          [customer],
        )
      ).rows[0].organization_id;
      await owner.query(
        'INSERT INTO webdock_auth.member("organizationId","userId",role,"createdAt") VALUES($1,$2,\'member\',now())',
        [org, subject],
      );
      await owner.query(
        "INSERT INTO webdock_admin.projects(id,name,customer_id,status) VALUES($1,$1,$2,'active')",
        [project, customer],
      );
      await owner.query(
        "INSERT INTO webdock_auth.database_binding(id,project_id,name,environment) VALUES($1,$2,'Gateway fixture','production')",
        [binding, project],
      );
      await owner.query(
        "INSERT INTO webdock_auth.database_grant(id,binding_id,subject,profile,runtime_origin,connection_id,secret_sealed) VALUES($1,$2,$3,'schema',$4,$5,$6)",
        [
          grant,
          binding,
          subject,
          origin,
          connection,
          encryptMailSecret(proxySecret, `database:${binding}:${subject}`),
        ],
      );
      await owner.query(
        "INSERT INTO webdock_auth.database_runtime_owner(runtime_origin,binding_id,subject,profile) VALUES($1,$2,$3,'schema')",
        [origin, binding, subject],
      );
      const launch = await open();
      const exchanged = await broker(() =>
        transaction((db) => exchangeLaunch(db, launch.code)),
      );
      const inspected = await broker(() =>
        transaction((db) => inspectSession(db, exchanged.token)),
      );
      assert.equal(inspected.subject, subject);
      assert.equal(inspected.profile, "schema");
      assert.equal(inspected.connectionID, connection);
      assert.equal(inspected.runtimeOrigin, origin);
      assert.equal(inspected.proxySecret, proxySecret);
      assert.equal(inspected.scopeID, exchanged.scopeID);
      await assert.rejects(
        broker(() => transaction((db) => exchangeLaunch(db, launch.code))),
        /unavailable/,
        "launch can be consumed once",
      );
      const second = await open();
      assert.equal(
        (await http({ action: "exchange", code: second.code }, "wrong")).status,
        401,
      );
      const reply = await http({ action: "exchange", code: second.code });
      assert.equal(reply.status, 200);
      const { data: gatewaySession } = await reply.json();
      assert.equal(
        (await http({ action: "inspect", token: gatewaySession.token })).status,
        200,
      );
      await owner.query(
        "UPDATE webdock_auth.database_grant SET enabled=false,revision=revision+1 WHERE id=$1",
        [grant],
      );
      assert.equal(
        (await http({ action: "inspect", token: gatewaySession.token })).status,
        404,
        "revoked grant invalidates existing gateway session",
      );
      await owner.query(
        "UPDATE webdock_auth.database_grant SET enabled=true WHERE id=$1",
        [grant],
      );
      const third = await open(),
        thirdReply = await http({ action: "exchange", code: third.code });
      assert.equal(thirdReply.status, 200);
      const thirdSession = (await thirdReply.json()).data;
      await owner.query(
        "UPDATE webdock_auth.session SET \"expiresAt\"=now()-interval '1 minute' WHERE id=$1",
        [session],
      );
      assert.notEqual(
        (await http({ action: "inspect", token: thirdSession.token })).status,
        200,
        "expired authentication session invalidates gateway session",
      );
      assert.equal(
        (await http({ action: "logout", token: thirdSession.token })).status,
        200,
      );
      assert.equal(
        (
          await broker(() =>
            database.query(
              "SELECT id FROM webdock_auth.database_session WHERE id=$1",
              [thirdSession.scopeID],
            ),
          )
        ).rowCount,
        0,
      );
    } finally {
      const cleanup = await owner.connect();
      try {
        await cleanup.query("BEGIN");
        await cleanup.query("SET LOCAL session_replication_role='replica'");
        await cleanup.query(
          "DELETE FROM webdock_auth.database_session WHERE grant_id=$1",
          [grant],
        );
        await cleanup.query(
          "DELETE FROM webdock_auth.database_launch WHERE grant_id=$1",
          [grant],
        );
        await cleanup.query(
          "DELETE FROM webdock_auth.database_audit WHERE binding_id=$1",
          [binding],
        );
        await cleanup.query(
          "DELETE FROM webdock_auth.database_runtime_owner WHERE binding_id=$1",
          [binding],
        );
        await cleanup.query(
          "DELETE FROM webdock_auth.database_grant WHERE id=$1",
          [grant],
        );
        await cleanup.query(
          "DELETE FROM webdock_auth.database_binding WHERE id=$1",
          [binding],
        );
        await cleanup.query("DELETE FROM webdock_admin.projects WHERE id=$1", [
          project,
        ]);
        await cleanup.query(
          "DELETE FROM webdock_auth.tenant_customer WHERE customer_id=$1",
          [customer],
        );
        await cleanup.query(
          'DELETE FROM webdock_auth.member WHERE "userId"=$1',
          [subject],
        );
        if (org)
          await cleanup.query(
            "DELETE FROM webdock_auth.organization WHERE id=$1",
            [org],
          );
        await cleanup.query("DELETE FROM webdock_admin.customers WHERE id=$1", [
          customer,
        ]);
        await cleanup.query("DELETE FROM webdock_auth.session WHERE id=$1", [
          session,
        ]);
        await cleanup.query('DELETE FROM webdock_auth."user" WHERE id=$1', [
          subject,
        ]);
        await cleanup.query("COMMIT");
      } catch (error) {
        await cleanup.query("ROLLBACK");
        throw error;
      } finally {
        cleanup.release();
        await Promise.all([
          owner.end(),
          database.end(),
          authDatabase.end(),
          workerDatabase.end(),
        ]);
      }
    }
  },
);
