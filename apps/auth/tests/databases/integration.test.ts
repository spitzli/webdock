import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { databaseSchemaSQL } from "../../src/lib/databases/schema";
import { executeDatabase, exchangeLaunch, inspectSession } from "../../src/lib/databases/service";
import type { HostingActor } from "@webdock/hosting-contracts";

const url = process.env.WEBDOCK_DATABASE_TEST_URL;
test("database grants, launches and revocation use real tenant boundaries", { skip: !url }, async () => {
  const target = new URL(url!);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.pathname === "/webdock_admin_test" && target.port === "55441", "Use the dedicated disposable database-browser fixture");
  const pool = new Pool({ connectionString: url });
  const db = await pool.connect();
  try {
    await db.query(`
      DROP SCHEMA IF EXISTS webdock_auth CASCADE; DROP SCHEMA IF EXISTS webdock_admin CASCADE;
      CREATE SCHEMA webdock_auth; CREATE SCHEMA webdock_admin;
      CREATE SEQUENCE webdock_auth.ids START 10000;
      CREATE FUNCTION webdock_auth.next_snowflake() RETURNS text LANGUAGE sql AS $$ SELECT nextval('webdock_auth.ids')::text $$;
      CREATE TABLE webdock_auth."user"(id text PRIMARY KEY,role text,banned boolean DEFAULT false,"emailVerified" boolean DEFAULT true,"mustChangePassword" boolean DEFAULT false,"twoFactorEnabled" boolean DEFAULT false);
      CREATE TABLE webdock_auth.session(id text PRIMARY KEY,"userId" text,"expiresAt" timestamptz);
      CREATE TABLE webdock_admin.customers(id varchar PRIMARY KEY,status text DEFAULT 'active');
      CREATE TABLE webdock_admin.projects(id varchar PRIMARY KEY,customer_id varchar REFERENCES webdock_admin.customers(id),status text DEFAULT 'active',name text);
      CREATE TABLE webdock_auth.tenant_customer(customer_id varchar,organization_id text);
      CREATE TABLE webdock_auth.member("organizationId" text,"userId" text,role text);
      CREATE TABLE webdock_auth.hosting_project(project_id varchar,mode text,provider text,cluster_id varchar,revision integer,own_images boolean);
      CREATE TABLE webdock_auth.studio_tenant_preview(session_id text,actor_id text,customer_id varchar,organization_id text,expires_at timestamptz,expired_at timestamptz);
      CREATE FUNCTION webdock_admin.lock_hosting_project(varchar) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM id FROM webdock_admin.projects WHERE id=$1 FOR SHARE; END $$;
      INSERT INTO webdock_auth."user"(id,role,"twoFactorEnabled") VALUES('operator','operator',true),('alice','user',false),('bob','user',false),('eve','user',false);
      INSERT INTO webdock_auth.session SELECT id,id,now()+interval '1 hour' FROM webdock_auth."user";
      INSERT INTO webdock_admin.customers(id) VALUES('100'),('200');
      INSERT INTO webdock_admin.projects(id,customer_id,name) VALUES('101','100','A'),('201','200','B');
      INSERT INTO webdock_auth.tenant_customer VALUES('100','org-a'),('200','org-b');
      INSERT INTO webdock_auth.member VALUES('org-a','alice','admin'),('org-a','bob','member'),('org-b','eve','admin');
    `);
    await db.query(databaseSchemaSQL);
    await db.query(databaseSchemaSQL);
    const actor = (subject: string): HostingActor => ({ subject, sessionID: subject, source: "studio", scopes: ["hosting:read", "hosting:write"] });
    const call = (subject: string, command: unknown) => executeDatabase(db, actor(subject), command);
    const created = await call("operator", { action: "create", projectID: "101", name: "Orders", environment: "production" }) as { id: string };
    const bindingID = created.id;
    const grant = { action: "grant", bindingID, subject: "alice", profile: "read", runtimeOrigin: "https://runtime-a.example.invalid", connectionID: "orders", proxySecret: "a".repeat(40), isolationVerified: true, databaseRoleVerified: true };
    await assert.rejects(call("alice", grant));
    await assert.rejects(call("operator", { ...grant, subject: "eve" }));
    await call("operator", grant);
    await db.query('UPDATE webdock_auth."user" SET "twoFactorEnabled"=false WHERE id=\'operator\'');
    await assert.rejects(call("operator", grant));
    await db.query('UPDATE webdock_auth."user" SET "twoFactorEnabled"=true WHERE id=\'operator\'');
    await assert.rejects(call("operator", { ...grant, profile: "write" }), /isolated runtime/i);
    await call("operator", { ...grant, runtimeOrigin: "https://runtime-new.example.invalid" });
    await assert.rejects(call("operator", { ...grant, subject: "bob" }), /runtime/i);
    await call("operator", grant);
    const list = await call("alice", { action: "list", customerID: "100" }) as { bindings: unknown[] };
    assert.equal(list.bindings.length, 1);
    assert.ok(!JSON.stringify(list).includes("runtime-a"));
    await assert.rejects(call("eve", { action: "get", bindingID }));
    await assert.rejects(call("bob", { action: "open", bindingID }));
    await assert.rejects(call("operator", { ...grant, subject: "bob" }), /runtime/i);
    const launch = await call("alice", { action: "open", bindingID }) as { code: string };
    const session = await exchangeLaunch(db, launch.code);
    await assert.rejects(exchangeLaunch(db, launch.code));
    const access = await inspectSession(db, session.token);
    assert.equal(access.subject, "alice");
    assert.equal(access.profile, "read");
    await db.query('DELETE FROM webdock_auth.member WHERE "userId"=\'alice\'');
    await assert.rejects(inspectSession(db, session.token));
    await db.query("INSERT INTO webdock_auth.member VALUES('org-a','alice','admin')");
    const concurrent = await call("alice", { action: "open", bindingID }) as { code: string };
    const exchange = async () => {
      const client = await pool.connect();
      try { await client.query("BEGIN"); const result = await exchangeLaunch(client, concurrent.code); await client.query("COMMIT"); return result; }
      catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    };
    const raced = await Promise.allSettled([exchange(), exchange()]);
    assert.equal(raced.filter(result => result.status === "fulfilled").length, 1);
    await db.query(`INSERT INTO webdock_auth.studio_tenant_preview VALUES('alice','alice','100','org-a',now()+interval '10 minutes',null)`);
    await assert.rejects(inspectSession(db, session.token));
    await db.query("DELETE FROM webdock_auth.studio_tenant_preview");
    await call("operator", { action: "revoke", bindingID, subject: "alice" });
    await assert.rejects(inspectSession(db, session.token));
    await call("operator", grant);
    const second = await call("alice", { action: "open", bindingID }) as { code: string };
    await db.query('UPDATE webdock_auth.session SET "expiresAt"=now()-interval \'1 second\' WHERE id=\'alice\'');
    await assert.rejects(exchangeLaunch(db, second.code));
  } finally { db.release(); await pool.end(); }
});
