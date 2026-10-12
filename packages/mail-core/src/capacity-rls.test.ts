import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { capacityRlsSQL } from "./capacity-rls";

const container = process.env.CAPACITY_TEST_CONTAINER;
test(
  "aggregate capacity counts hidden tenant holds without returning tenant rows",
  { skip: !container },
  () => {
    const database = "wd_capacity_test_" + randomBytes(6).toString("hex");
    const sql = (statement: string, db = database) =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          container!,
          "psql",
          "-X",
          "-v",
          "ON_ERROR_STOP=1",
          "-At",
          "-U",
          "webdock_migration_test",
          "-d",
          db,
        ],
        { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();
    sql(`CREATE DATABASE ${database}`, "postgres");
    try {
      sql(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='webdock_platform_owner') THEN CREATE ROLE webdock_platform_owner NOLOGIN; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='webdock_auth_runtime') THEN CREATE ROLE webdock_auth_runtime NOLOGIN; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='webdock_worker_runtime') THEN CREATE ROLE webdock_worker_runtime NOLOGIN; END IF; END $$;
 CREATE SCHEMA webdock_auth; CREATE SCHEMA webdock_mail; CREATE SCHEMA webdock_rls;
 CREATE FUNCTION webdock_rls.request_scope() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT CASE current_setting('test.scope',true) WHEN 'valid' THEN '{"kind":"session"}'::jsonb WHEN 'operator' THEN '{"kind":"session"}'::jsonb WHEN 'revoked' THEN '{"kind":"session"}'::jsonb WHEN 'agent-a' THEN '{"kind":"system","purpose":"agent","clusterID":"cluster"}'::jsonb WHEN 'git' THEN '{"kind":"system","purpose":"git-worker"}'::jsonb WHEN 'order-a' THEN '{"kind":"system","purpose":"database-order","customerID":"tenant-a"}'::jsonb WHEN 'mail-cron' THEN '{"kind":"system","purpose":"mail-cron"}'::jsonb ELSE NULL END $$;
 CREATE FUNCTION webdock_rls.actor() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT CASE WHEN current_setting('test.scope',true) IN ('valid','operator') AND session_user='webdock_auth_runtime' THEN '{"subject":"tenant-a-user"}'::jsonb ELSE NULL END $$;
 CREATE FUNCTION webdock_rls.operator() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.scope',true)='operator' AND session_user='webdock_auth_runtime' $$;
 CREATE FUNCTION webdock_rls.customer_allowed(text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1='tenant-a' $$;
 CREATE TABLE webdock_auth.hosting_reservation(customer_id text,cluster_id text,demand jsonb,status text);
 CREATE TABLE webdock_mail.cluster_reservation(customer_id text,cluster_id text,demand jsonb,status text);
 CREATE TABLE webdock_auth.hosting_database_backend(id text,cluster_id text,node text,pool_id uuid,demand jsonb,state text);
 CREATE TABLE webdock_auth.hosting_database_pool(cluster_id text,node text,pool_id uuid,capacity_bytes bigint);
 CREATE TABLE webdock_auth.hosting_cluster(id text,capacity jsonb,ownership text,dedicated_customer_id text);
 CREATE TABLE webdock_auth.hosting_agent(cluster_id text,observation jsonb);
 CREATE TABLE webdock_auth.hosting_database(id text,customer_id text,backend_id text,state text,pending_plan_revision_id text,plan_revision_id text);
 CREATE TABLE webdock_auth.hosting_database_plan(id text,plan jsonb);
 CREATE TABLE webdock_auth.hosting_database_migration(source_backend_id text,source_allowance_bytes bigint,state text);
 GRANT USAGE ON SCHEMA webdock_auth,webdock_mail,webdock_rls TO webdock_platform_owner,webdock_auth_runtime,webdock_worker_runtime;
 GRANT SELECT ON ALL TABLES IN SCHEMA webdock_auth,webdock_mail TO webdock_platform_owner,webdock_auth_runtime;
 ALTER TABLE webdock_auth.hosting_reservation ENABLE ROW LEVEL SECURITY;
 ALTER TABLE webdock_auth.hosting_reservation FORCE ROW LEVEL SECURITY;
 CREATE POLICY tenant ON webdock_auth.hosting_reservation TO webdock_auth_runtime USING(customer_id='tenant-a');
 CREATE POLICY owner ON webdock_auth.hosting_reservation TO webdock_platform_owner USING(true);
 ALTER TABLE webdock_auth.hosting_database ENABLE ROW LEVEL SECURITY;
 ALTER TABLE webdock_auth.hosting_database FORCE ROW LEVEL SECURITY;
 CREATE POLICY tenant ON webdock_auth.hosting_database TO webdock_auth_runtime USING(customer_id='tenant-a');
 CREATE POLICY owner ON webdock_auth.hosting_database TO webdock_platform_owner USING(true);
 INSERT INTO webdock_auth.hosting_reservation VALUES('tenant-a','cluster','{"cpuMillicores":100,"replicasPerApp":1,"concurrentDeployments":1}','active'),('tenant-b','cluster','{"cpuMillicores":900,"replicasPerApp":3,"concurrentDeployments":2}','reserved');
 INSERT INTO webdock_auth.hosting_cluster VALUES('cluster','{"volumeBytes":10000}','platform',NULL),('private-a','{}','tenant','tenant-a'),('private-b','{}','tenant','tenant-b');
 INSERT INTO webdock_auth.hosting_agent VALUES('cluster','{"capacity":{"volumeBytes":8000},"capabilities":{"databaseVersion":1,"databasePools":[{"node":"node","poolID":"00000000-0000-4000-8000-000000000001","observedDatabases":[{"installationID":"hidden","cpuMillicores":80,"memoryBytes":90}],"allocations":[{"installationID":"hidden","volumeBytes":100}]}]}}');
 INSERT INTO webdock_auth.hosting_database_backend VALUES('hidden','cluster','node','00000000-0000-4000-8000-000000000001','{"cpuMillicores":200,"memoryBytes":300,"volumeBytes":400}','ready');
 INSERT INTO webdock_auth.hosting_database_backend VALUES('foreign-backend','private-b','foreign-node','00000000-0000-4000-8000-000000000002','{}','ready');
 INSERT INTO webdock_auth.hosting_database_pool VALUES('cluster','node','00000000-0000-4000-8000-000000000001',1000);
 INSERT INTO webdock_auth.hosting_database_plan VALUES('plan','{"logicalStorageAllowanceBytes":100}');
 INSERT INTO webdock_auth.hosting_database VALUES('own','tenant-a','hidden','ready',NULL,'plan'),('other','tenant-b','hidden','ready',NULL,'plan');
 INSERT INTO webdock_auth.hosting_database_migration VALUES('hidden',50,'retained');
 ${capacityRlsSQL}`);
      const runtime = (q: string) =>
        sql(
          `SET SESSION AUTHORIZATION webdock_auth_runtime; SET test.scope='valid'; ${q}`,
        )
          .split("\n")
          .filter((s) => s !== "SET")
          .join("\n");
      const worker = (scope: string, query: string) =>
        sql(
          `SET SESSION AUTHORIZATION webdock_worker_runtime; SET test.scope='${scope}'; ${query}`,
        );
      for (const query of [
        "SELECT webdock_rls.capacity_demand('private-b','all')",
        "SELECT * FROM webdock_rls.capacity_pools('private-b')",
        "SELECT * FROM webdock_rls.capacity_slots('foreign-backend')",
      ]) {
        assert.throws(
          () => runtime(query),
          "Tenant A must not inspect tenant B private capacity",
        );
        assert.throws(
          () => worker("agent-a", query),
          "Cluster-bound agent cannot inspect a different cluster",
        );
      }
      assert.doesNotThrow(() =>
        runtime("SELECT webdock_rls.capacity_demand('private-a','all')"),
      );
      assert.doesNotThrow(() =>
        runtime(
          "SET test.scope='operator'; SELECT webdock_rls.capacity_demand('private-b','all')",
        ),
      );
      assert.throws(() =>
        runtime(
          "SET test.scope='revoked'; SELECT webdock_rls.capacity_demand('cluster','all')",
        ),
      );
      assert.throws(() =>
        runtime(
          "SET test.scope='git'; SELECT webdock_rls.capacity_demand('private-b','all')",
        ),
      );
      assert.doesNotThrow(() =>
        worker(
          "agent-a",
          "SELECT webdock_rls.capacity_demand('cluster','all')",
        ),
      );
      assert.doesNotThrow(() =>
        worker("git", "SELECT webdock_rls.capacity_demand('private-b','all')"),
      );
      assert.doesNotThrow(() =>
        worker(
          "order-a",
          "SELECT webdock_rls.capacity_demand('private-a','all')",
        ),
      );
      assert.throws(() =>
        worker(
          "order-a",
          "SELECT webdock_rls.capacity_demand('private-b','all')",
        ),
      );
      assert.throws(() =>
        worker(
          "mail-cron",
          "SELECT webdock_rls.capacity_demand('cluster','all')",
        ),
      );
      assert.equal(
        runtime("SELECT count(*) FROM webdock_auth.hosting_reservation"),
        "1",
      );
      const demand = JSON.parse(
        runtime("SELECT webdock_rls.capacity_demand('cluster','apps')"),
      );
      assert.equal(demand.cpuMillicores, 1000);
      assert.ok(
        demand.cpuMillicores + 1 > 1000,
        "an admission at the cluster ceiling must reject even though the other tenant is invisible",
      );
      assert.equal(demand.replicasPerApp, 3);
      assert.equal(demand.concurrentDeployments, 2);
      const native = JSON.parse(
        runtime("SELECT webdock_rls.capacity_demand('cluster','native')"),
      );
      assert.equal(native.volumeBytes, 2000);
      const pools = JSON.parse(
        runtime(
          "SELECT row_to_json(p) FROM webdock_rls.capacity_pools('cluster') p",
        ),
      );
      assert.equal(Number(pools.held_cpu), 200);
      assert.equal(Number(pools.known_cpu), 80);
      assert.equal(Number(pools.allocated), 100);
      assert.ok(!JSON.stringify(pools).includes("hidden"));
      assert.ok(!JSON.stringify(pools).includes("tenant-b"));
      assert.equal(
        runtime(
          "SELECT count||':'||bytes FROM webdock_rls.capacity_slots('hidden')",
        ),
        "3:250",
      );
      assert.equal(
        runtime(
          "SELECT count||':'||bytes FROM webdock_rls.capacity_slots('hidden','own')",
        ),
        "2:150",
      );
      assert.throws(() =>
        runtime("SELECT * FROM webdock_rls.capacity_slots('hidden','other')"),
      );
      assert.throws(() =>
        runtime(
          "SELECT webdock_rls.capacity_demand('cluster','all','tenant-b')",
        ),
      );
      assert.throws(() =>
        sql(
          "SET SESSION AUTHORIZATION webdock_auth_runtime; SELECT webdock_rls.capacity_demand('cluster','apps')",
        ),
      );
      assert.equal(
        sql(
          "SELECT has_function_privilege('public','webdock_rls.capacity_demand(text,text,text)','EXECUTE')",
        ),
        "f",
      );
    } finally {
      sql(`DROP DATABASE ${database} WITH (FORCE)`, "postgres");
    }
  },
);
