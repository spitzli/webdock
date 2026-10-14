export const hostingEnvironmentSchemaSQL = `ALTER TABLE webdock_auth.hosting_app ADD COLUMN IF NOT EXISTS environment_encrypted text;
ALTER TABLE webdock_auth.hosting_app ADD COLUMN IF NOT EXISTS previous_environment_encrypted text;
ALTER TABLE webdock_auth.hosting_app ADD COLUMN IF NOT EXISTS observed_environment_encrypted text;`;
// Explicit migration only. Never invoke schema creation from requests.
export const hostingSchemaSQL = `
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_cluster (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(), name text NOT NULL,
 provider text NOT NULL, country text, region text NOT NULL, location_evidence text NOT NULL,
 dedicated_customer_id varchar REFERENCES webdock_admin.customers(id) ON DELETE RESTRICT,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), generation integer NOT NULL DEFAULT 0 CHECK(generation>=0),
 verified boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE webdock_auth.hosting_cluster ALTER COLUMN country DROP NOT NULL;
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_enrollment (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(), cluster_id varchar NOT NULL REFERENCES webdock_auth.hosting_cluster(id) ON DELETE RESTRICT,
 actor_id text NOT NULL, token_hash text UNIQUE, expires_at timestamptz NOT NULL, consumed_at timestamptz,
 issued_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_agent (
 cluster_id varchar PRIMARY KEY REFERENCES webdock_auth.hosting_cluster(id) ON DELETE RESTRICT,
 credential_hash text UNIQUE NOT NULL, generation integer NOT NULL CHECK(generation>0),
 revoked boolean NOT NULL DEFAULT false, last_sequence bigint NOT NULL DEFAULT -1,
 last_seen timestamptz, observation jsonb
);
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_project (
 project_id varchar PRIMARY KEY REFERENCES webdock_admin.projects(id) ON DELETE RESTRICT,
 customer_id varchar NOT NULL REFERENCES webdock_admin.customers(id) ON DELETE RESTRICT,
 provider text NOT NULL CHECK(provider IN ('k3s','vercel')),
 cluster_id varchar REFERENCES webdock_auth.hosting_cluster(id) ON DELETE RESTRICT,
 namespace text UNIQUE, mode text NOT NULL CHECK(mode IN ('managed','selfservice')),
 own_images boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 CHECK((provider='k3s' AND cluster_id IS NOT NULL AND namespace IS NOT NULL) OR (provider='vercel' AND cluster_id IS NULL AND namespace IS NULL))
);
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_limit (
 customer_id varchar NOT NULL REFERENCES webdock_admin.customers(id) ON DELETE RESTRICT,
 scope text NOT NULL, values jsonb NOT NULL, revision integer NOT NULL CHECK(revision>0),
 PRIMARY KEY(customer_id,scope)
);
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_operation (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(), subject text NOT NULL,
 customer_id varchar REFERENCES webdock_admin.customers(id) ON DELETE RESTRICT,
 project_id varchar REFERENCES webdock_admin.projects(id) ON DELETE RESTRICT,
 cluster_id varchar REFERENCES webdock_auth.hosting_cluster(id) ON DELETE RESTRICT,
 action text NOT NULL, idempotency_key text NOT NULL, payload_hash text NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','running','succeeded','failed','needs-reconciliation')),
 result jsonb, generation integer NOT NULL DEFAULT 0 CHECK(generation>=0),
 lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(subject,idempotency_key)
);
CREATE INDEX IF NOT EXISTS hosting_queue ON webdock_auth.hosting_operation(cluster_id,status,created_at);
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_reservation (
 operation_id varchar PRIMARY KEY REFERENCES webdock_auth.hosting_operation(id) ON DELETE RESTRICT,
 customer_id varchar NOT NULL REFERENCES webdock_admin.customers(id) ON DELETE RESTRICT,
 project_id varchar NOT NULL REFERENCES webdock_auth.hosting_project(project_id) ON DELETE RESTRICT,
 cluster_id varchar NOT NULL REFERENCES webdock_auth.hosting_cluster(id) ON DELETE RESTRICT,
 demand jsonb NOT NULL, status text NOT NULL CHECK(status IN ('reserved','active','released'))
);
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_audit (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(), subject text NOT NULL,
 action text NOT NULL, target_id text NOT NULL, outcome text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_rate (
 key_hash text PRIMARY KEY, window_start timestamptz NOT NULL DEFAULT now(), requests integer NOT NULL DEFAULT 1
);

ALTER TABLE webdock_auth.hosting_cluster ADD COLUMN IF NOT EXISTS capacity jsonb;
ALTER TABLE webdock_auth.hosting_cluster ADD COLUMN IF NOT EXISTS verification_evidence text;
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_app (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 project_id varchar NOT NULL REFERENCES webdock_auth.hosting_project(project_id) ON DELETE RESTRICT,
 name text NOT NULL, spec jsonb NOT NULL, previous_spec jsonb,
 revision integer NOT NULL DEFAULT 1, observed_revision integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'pending', operation_id varchar, last_error text, logs text,
 observed_uid text, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE webdock_auth.hosting_app ADD COLUMN IF NOT EXISTS observed_spec jsonb;
${hostingEnvironmentSchemaSQL}
UPDATE webdock_auth.hosting_app SET observed_spec=spec WHERE observed_spec IS NULL AND observed_revision=revision AND status IN ('ready','stopped');
CREATE UNIQUE INDEX IF NOT EXISTS hosting_app_name ON webdock_auth.hosting_app(project_id,name) WHERE status<>'deleted';
ALTER TABLE webdock_auth.hosting_operation ADD COLUMN IF NOT EXISTS app_id varchar REFERENCES webdock_auth.hosting_app(id) ON DELETE RESTRICT;
ALTER TABLE webdock_auth.hosting_operation ADD COLUMN IF NOT EXISTS desired jsonb;
ALTER TABLE webdock_auth.hosting_operation ADD COLUMN IF NOT EXISTS target_revision integer;
ALTER TABLE webdock_auth.hosting_reservation ADD COLUMN IF NOT EXISTS app_id varchar REFERENCES webdock_auth.hosting_app(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS webdock_auth.hosting_byok_policy (
 customer_id varchar PRIMARY KEY REFERENCES webdock_admin.customers(id) ON DELETE RESTRICT,
 revision integer NOT NULL DEFAULT 1, policy jsonb NOT NULL
);
ALTER TABLE webdock_auth.hosting_cluster ADD COLUMN IF NOT EXISTS ownership text NOT NULL DEFAULT 'platform';
ALTER TABLE webdock_auth.hosting_cluster ADD COLUMN IF NOT EXISTS cluster_uid text;
ALTER TABLE webdock_auth.hosting_cluster ADD COLUMN IF NOT EXISTS inventory jsonb;
ALTER TABLE webdock_auth.hosting_cluster ADD COLUMN IF NOT EXISTS scan_requested boolean NOT NULL DEFAULT false;
ALTER TABLE webdock_auth.hosting_operation ADD COLUMN IF NOT EXISTS actor_session text;
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_external_state (
 cluster_id varchar NOT NULL REFERENCES webdock_auth.hosting_cluster(id), uid text NOT NULL,
 previous_replicas integer NOT NULL, PRIMARY KEY(cluster_id,uid)
);
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_vercel (
 customer_id varchar PRIMARY KEY REFERENCES webdock_admin.customers(id) ON DELETE RESTRICT,
 team_id text NOT NULL UNIQUE, configuration_id text NOT NULL UNIQUE, encrypted_token text NOT NULL,
 projects jsonb NOT NULL DEFAULT '[]', revision integer NOT NULL DEFAULT 1, connected_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_vercel_flow (
 state_hash text PRIMARY KEY, customer_id varchar NOT NULL, subject text NOT NULL, session_id text NOT NULL,
 expires_at timestamptz NOT NULL, consumed boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS webdock_auth.hosting_turbosmtp (
 customer_id varchar PRIMARY KEY REFERENCES webdock_admin.customers(id) ON DELETE RESTRICT,
 label text NOT NULL, encrypted_secret text, credential_hash text UNIQUE, key_suffix text,
 revision integer NOT NULL DEFAULT 1, snapshot jsonb NOT NULL DEFAULT '[]', checked_at timestamptz,
 pending_domain text, operation_token text, state text NOT NULL DEFAULT 'ready', updated_at timestamptz NOT NULL DEFAULT now()
);
`;
// OAuth resources are persisted by Better Auth; changing config does not update existing scopes.
export async function migrateHosting(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  resource: string,
) {
  await db.query(hostingSchemaSQL);
  await db.query(
    `UPDATE webdock_auth."oauthResource" SET "allowedScopes"=(
 SELECT jsonb_agg(DISTINCT scope) FROM jsonb_array_elements("allowedScopes" || '["hosting:read","hosting:write"]'::jsonb) scope
 ),"policyVersion"="policyVersion"+1,"updatedAt"=now()
 WHERE identifier=$1 AND jsonb_typeof("allowedScopes")='array' AND NOT "allowedScopes" @> '["hosting:read","hosting:write"]'::jsonb`,
    [resource],
  );
}
