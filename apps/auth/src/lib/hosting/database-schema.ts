// Explicit additive migration. Never execute from an HTTP request or agent heartbeat.
export function databaseRuntimeGrants(role: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(role)) throw Error("Invalid runtime role");
  const tables = [
    "plan",
    "pool",
    "backend",
    "port",
    "offer",
    "order",
    "job",
    "migration",
    "preview",
  ].map((name) => `webdock_auth.hosting_database_${name}`);
  tables.push("webdock_auth.hosting_database");
  return `GRANT USAGE ON SCHEMA webdock_auth TO "${role}";
GRANT SELECT,INSERT,UPDATE ON ${tables.join(",")} TO "${role}";
GRANT DELETE ON webdock_auth.hosting_database_port,webdock_auth.hosting_database_preview TO "${role}";`;
}
export const databaseSchemaSQL = `
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_database_plan (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(), plan jsonb NOT NULL,
 availability text NOT NULL DEFAULT 'disabled' CHECK(availability IN ('disabled','pilot','public')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_database_pool (
 cluster_id varchar NOT NULL REFERENCES webdock_auth.hosting_cluster(id),node text NOT NULL,pool_id uuid NOT NULL,
 capacity_bytes bigint NOT NULL CHECK(capacity_bytes>0),registered_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(cluster_id,pool_id)
);
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_database_backend (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 cluster_id varchar NOT NULL REFERENCES webdock_auth.hosting_cluster(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('shared-pool','dedicated')), node text NOT NULL, pool_id uuid NOT NULL,
 revision integer NOT NULL DEFAULT 1, observed_revision integer NOT NULL DEFAULT 0,
 state text NOT NULL DEFAULT 'provisioning', cnpg_uid text, demand jsonb NOT NULL, profile jsonb NOT NULL DEFAULT '{}',
 max_databases integer NOT NULL CHECK(max_databases BETWEEN 1 AND 100),
 logical_capacity_bytes bigint NOT NULL CHECK(logical_capacity_bytes>=0),
 host text NOT NULL, direct_port integer NOT NULL CHECK(direct_port BETWEEN 30000 AND 32767),
 pooled_port integer NOT NULL CHECK(pooled_port BETWEEN 30000 AND 32767),
 endpoint_ready boolean NOT NULL DEFAULT false, observed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), 
 CHECK(direct_port<>pooled_port)
);
ALTER TABLE webdock_auth.hosting_database_backend DROP CONSTRAINT IF EXISTS hosting_database_backend_cluster_id_direct_port_key;
ALTER TABLE webdock_auth.hosting_database_backend DROP CONSTRAINT IF EXISTS hosting_database_backend_cluster_id_pooled_port_key;
CREATE UNIQUE INDEX IF NOT EXISTS hosting_database_direct_port_active ON webdock_auth.hosting_database_backend(cluster_id,direct_port) WHERE state<>'purged';
CREATE UNIQUE INDEX IF NOT EXISTS hosting_database_pooled_port_active ON webdock_auth.hosting_database_backend(cluster_id,pooled_port) WHERE state<>'purged';
ALTER TABLE webdock_auth.hosting_database_backend ADD COLUMN IF NOT EXISTS ca_certificate text;
ALTER TABLE webdock_auth.hosting_database_backend ADD COLUMN IF NOT EXISTS filesystem_used_bytes bigint;
ALTER TABLE webdock_auth.hosting_database_backend ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_database_port (
 cluster_id varchar NOT NULL REFERENCES webdock_auth.hosting_cluster(id), port integer NOT NULL CHECK(port BETWEEN 30000 AND 32767),
 backend_id varchar NOT NULL REFERENCES webdock_auth.hosting_database_backend(id),PRIMARY KEY(cluster_id,port)
);
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_database_offer (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 customer_id varchar NOT NULL REFERENCES webdock_admin.customers(id),
 project_id varchar NOT NULL REFERENCES webdock_admin.projects(id),
 plan_revision_id varchar NOT NULL REFERENCES webdock_auth.hosting_database_plan(id),
 name text NOT NULL, snapshot jsonb NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_database_order (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 offer_id varchar NOT NULL UNIQUE REFERENCES webdock_auth.hosting_database_offer(id),
 customer_id varchar NOT NULL REFERENCES webdock_admin.customers(id),
 project_id varchar NOT NULL REFERENCES webdock_admin.projects(id),
 plan_revision_id varchar NOT NULL REFERENCES webdock_auth.hosting_database_plan(id),
 accepted_by text NOT NULL,accepted_at timestamptz NOT NULL DEFAULT now(),
 snapshot jsonb NOT NULL,billing_started_at timestamptz,cancellation_requested_at timestamptz,ended_at timestamptz
);
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_database (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 customer_id varchar NOT NULL REFERENCES webdock_admin.customers(id),
 project_id varchar NOT NULL REFERENCES webdock_admin.projects(id),
 order_id varchar NOT NULL UNIQUE REFERENCES webdock_auth.hosting_database_order(id),
 plan_revision_id varchar NOT NULL REFERENCES webdock_auth.hosting_database_plan(id),
 backend_id varchar NOT NULL REFERENCES webdock_auth.hosting_database_backend(id),
 kind text NOT NULL CHECK(kind IN ('shared','dedicated')),name text NOT NULL,database_name text NOT NULL UNIQUE,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),observed_revision integer NOT NULL DEFAULT 0,
 state text NOT NULL DEFAULT 'provisioning' CHECK(state IN ('provisioning','ready','pausing','paused','resuming','updating','restoring','degraded','deleting','retained','purged','needs-reconciliation')),
 credential_revision integer NOT NULL DEFAULT 1, credentials_encrypted text NOT NULL,
 confirmed_credential_revision integer NOT NULL DEFAULT 0,confirmed_credentials_encrypted text,
 operation_id varchar REFERENCES webdock_auth.hosting_operation(id),observed_at timestamptz,
 usage jsonb,retained_until timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE webdock_auth.hosting_database ADD COLUMN IF NOT EXISTS pending_plan_revision_id varchar REFERENCES webdock_auth.hosting_database_plan(id);
ALTER TABLE webdock_auth.hosting_database ADD COLUMN IF NOT EXISTS pending_order_id varchar REFERENCES webdock_auth.hosting_database_order(id);
ALTER TABLE webdock_auth.hosting_database_order ADD COLUMN IF NOT EXISTS database_id varchar REFERENCES webdock_auth.hosting_database(id);
UPDATE webdock_auth.hosting_database_order o SET database_id=d.id FROM webdock_auth.hosting_database d WHERE d.order_id=o.id AND o.database_id IS NULL;
CREATE INDEX IF NOT EXISTS hosting_database_customer ON webdock_auth.hosting_database(customer_id,project_id);
CREATE INDEX IF NOT EXISTS hosting_database_backend_members ON webdock_auth.hosting_database(backend_id,state);
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_database_job (
 operation_id varchar PRIMARY KEY REFERENCES webdock_auth.hosting_operation(id),
 backend_id varchar NOT NULL REFERENCES webdock_auth.hosting_database_backend(id),
 database_id varchar REFERENCES webdock_auth.hosting_database(id),
 action text NOT NULL,revision integer NOT NULL,lease_token_hash text,
 checkpoint jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE webdock_auth.hosting_database ADD COLUMN IF NOT EXISTS pending_backend_id varchar REFERENCES webdock_auth.hosting_database_backend(id);
ALTER TABLE webdock_auth.hosting_database_job ADD COLUMN IF NOT EXISTS source_backend_id varchar REFERENCES webdock_auth.hosting_database_backend(id);
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_database_migration (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),database_id varchar NOT NULL REFERENCES webdock_auth.hosting_database(id),
 source_backend_id varchar NOT NULL REFERENCES webdock_auth.hosting_database_backend(id),target_backend_id varchar NOT NULL REFERENCES webdock_auth.hosting_database_backend(id),
 target_order_id varchar NOT NULL UNIQUE REFERENCES webdock_auth.hosting_database_order(id),source_order_id varchar NOT NULL REFERENCES webdock_auth.hosting_database_order(id),
 source_plan_revision_id varchar NOT NULL REFERENCES webdock_auth.hosting_database_plan(id),source_credential_revision integer NOT NULL,
 source_credentials_encrypted text NOT NULL,transfer_credentials_encrypted text NOT NULL,source_allowance_bytes bigint NOT NULL DEFAULT 0,
 state text NOT NULL DEFAULT 'preparing' CHECK(state IN ('preparing','copying','retained','needs-reconciliation','purged')),
 job_uid text,copy_sha256 text,retained_until timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(source_backend_id<>target_backend_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS hosting_database_pending_migration ON webdock_auth.hosting_database_migration(database_id) WHERE state IN ('preparing','copying','needs-reconciliation');
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_database_preview (
 database_id varchar NOT NULL REFERENCES webdock_auth.hosting_database(id),session_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('delete','purge') OR kind ~ '^migration:[1-9][0-9]{0,18}$'),plan_hash text NOT NULL,revision integer NOT NULL,expires_at timestamptz NOT NULL,
 PRIMARY KEY(database_id,session_id,kind)
);
ALTER TABLE webdock_auth.hosting_database_job ADD COLUMN IF NOT EXISTS migration_id varchar REFERENCES webdock_auth.hosting_database_migration(id);
ALTER TABLE webdock_auth.hosting_database_preview DROP CONSTRAINT IF EXISTS hosting_database_preview_kind_check;
ALTER TABLE webdock_auth.hosting_database_preview ADD CONSTRAINT hosting_database_preview_kind_check CHECK(kind IN ('delete','purge') OR kind ~ '^migration:[1-9][0-9]{0,18}$');
CREATE OR REPLACE FUNCTION webdock_auth.database_immutable_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='hosting_database_plan' THEN
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN RAISE EXCEPTION 'Database plan revisions are immutable'; END IF;
 ELSIF TG_TABLE_NAME='hosting_database_offer' THEN
  RAISE EXCEPTION 'Database offers are immutable';
 ELSE
  IF OLD.database_id IS NOT NULL AND NEW.database_id IS DISTINCT FROM OLD.database_id THEN RAISE EXCEPTION 'Database order is already consumed'; END IF;
  IF (NEW.offer_id,NEW.customer_id,NEW.project_id,NEW.plan_revision_id,NEW.accepted_by,NEW.accepted_at,NEW.snapshot)
     IS DISTINCT FROM (OLD.offer_id,OLD.customer_id,OLD.project_id,OLD.plan_revision_id,OLD.accepted_by,OLD.accepted_at,OLD.snapshot)
  THEN RAISE EXCEPTION 'Accepted database terms are immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS database_plan_immutable ON webdock_auth.hosting_database_plan;
CREATE TRIGGER database_plan_immutable BEFORE UPDATE ON webdock_auth.hosting_database_plan FOR EACH ROW EXECUTE FUNCTION webdock_auth.database_immutable_terms();
DROP TRIGGER IF EXISTS database_offer_immutable ON webdock_auth.hosting_database_offer;
CREATE TRIGGER database_offer_immutable BEFORE UPDATE ON webdock_auth.hosting_database_offer FOR EACH ROW EXECUTE FUNCTION webdock_auth.database_immutable_terms();
DROP TRIGGER IF EXISTS database_order_immutable ON webdock_auth.hosting_database_order;
CREATE TRIGGER database_order_immutable BEFORE UPDATE ON webdock_auth.hosting_database_order FOR EACH ROW EXECUTE FUNCTION webdock_auth.database_immutable_terms();
`;
