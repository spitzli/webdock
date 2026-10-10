import { gitVercelSchemaSQL } from "./git-vercel";
// Explicit migration only: never run DDL from request handlers.
export const gitDeploymentSchemaSQL = `
${gitVercelSchemaSQL}
CREATE TABLE IF NOT EXISTS webdock_auth.git_connection (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(), customer_id varchar NOT NULL REFERENCES webdock_admin.customers(id),
 installation_id text NOT NULL UNIQUE, account_id text NOT NULL, account_login text NOT NULL, permissions jsonb NOT NULL,
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','disconnected','revalidation-required')), generation integer NOT NULL DEFAULT 1 CHECK(generation>0),
 revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,customer_id)
);
CREATE TABLE IF NOT EXISTS webdock_auth.git_repository (
 connection_id varchar NOT NULL,customer_id varchar NOT NULL,repository_id text NOT NULL,metadata jsonb NOT NULL,
 PRIMARY KEY(connection_id,repository_id), FOREIGN KEY(connection_id,customer_id) REFERENCES webdock_auth.git_connection(id,customer_id)
);
CREATE TABLE IF NOT EXISTS webdock_auth.git_flow (
 state_hash text PRIMARY KEY,subject text NOT NULL,session_id text NOT NULL,customer_id varchar NOT NULL REFERENCES webdock_admin.customers(id),
 expires_at timestamptz NOT NULL,consumed_at timestamptz,user_token_encrypted text,installation_id text
);
CREATE TABLE IF NOT EXISTS webdock_auth.git_source (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),customer_id varchar NOT NULL REFERENCES webdock_admin.customers(id),
 project_id varchar NOT NULL UNIQUE REFERENCES webdock_auth.hosting_project(project_id),connection_id varchar NOT NULL,repository_id text NOT NULL,
 branch text NOT NULL,root_directory text NOT NULL,recipe text NOT NULL CHECK(recipe IN ('dockerfile','vercel')),target_id varchar NOT NULL,
 revision integer NOT NULL DEFAULT 1,enabled boolean NOT NULL DEFAULT true,environment_revision integer NOT NULL DEFAULT 1,
 latest_build_id varchar,desired_release_id varchar,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(connection_id,customer_id) REFERENCES webdock_auth.git_connection(id,customer_id),
 CONSTRAINT git_source_project_customer_fk FOREIGN KEY(project_id,customer_id) REFERENCES webdock_auth.hosting_project(project_id,customer_id),
 FOREIGN KEY(connection_id,repository_id) REFERENCES webdock_auth.git_repository(connection_id,repository_id),UNIQUE(id,customer_id,project_id)
);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='git_source_project_customer_fk' AND conrelid='webdock_auth.git_source'::regclass) THEN
 ALTER TABLE webdock_auth.git_source ADD CONSTRAINT git_source_project_customer_fk FOREIGN KEY(project_id,customer_id) REFERENCES webdock_auth.hosting_project(project_id,customer_id);
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS webdock_auth.git_worker (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),credential_hash text NOT NULL UNIQUE,generation integer NOT NULL DEFAULT 1,
 enabled boolean NOT NULL DEFAULT false,country text NOT NULL,isolation text NOT NULL CHECK(isolation IN ('microvm','artifact-only')),evidence text NOT NULL,
 capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 32),created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE webdock_auth.git_worker DROP CONSTRAINT IF EXISTS git_worker_isolation_check;
ALTER TABLE webdock_auth.git_worker ADD CONSTRAINT git_worker_isolation_check CHECK(isolation IN ('microvm','artifact-only'));
ALTER TABLE webdock_auth.git_source ADD COLUMN IF NOT EXISTS build_provider text NOT NULL DEFAULT 'isolated' CHECK(build_provider IN ('isolated','github-actions'));
ALTER TABLE webdock_auth.git_source ADD COLUMN IF NOT EXISTS workflow_path text NOT NULL DEFAULT '.github/workflows/webdock.yml';
ALTER TABLE webdock_auth.git_source ADD COLUMN IF NOT EXISTS artifact_prefix text NOT NULL DEFAULT 'webdock';
ALTER TABLE webdock_auth.git_source ADD COLUMN IF NOT EXISTS actions_configured_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS webdock_auth.git_build (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),customer_id varchar NOT NULL,project_id varchar NOT NULL,source_id varchar NOT NULL,
 source_sha text NOT NULL CHECK(source_sha ~ '^[a-f0-9]{40}$'),source_revision integer NOT NULL,connection_generation integer NOT NULL,environment_revision integer NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','cancelled')),
 worker_id varchar REFERENCES webdock_auth.git_worker(id),worker_generation integer,generation integer NOT NULL DEFAULT 0,lease_until timestamptz,
 subject text NOT NULL,idempotency_key text NOT NULL,logs text NOT NULL DEFAULT '' CHECK(octet_length(logs)<=262144),failure_code text,
 created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 FOREIGN KEY(source_id,customer_id,project_id) REFERENCES webdock_auth.git_source(id,customer_id,project_id),
 UNIQUE(project_id,idempotency_key),UNIQUE(id,customer_id,project_id)
);
ALTER TABLE webdock_auth.git_build ADD COLUMN IF NOT EXISTS actions_provenance jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS git_build_actions_run ON webdock_auth.git_build(source_id,(actions_provenance->>'runID'),(actions_provenance->>'runAttempt')) WHERE actions_provenance IS NOT NULL;
CREATE INDEX IF NOT EXISTS git_build_queue ON webdock_auth.git_build(status,created_at);
CREATE TABLE IF NOT EXISTS webdock_auth.git_artifact (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),build_id varchar NOT NULL UNIQUE,customer_id varchar NOT NULL,project_id varchar NOT NULL,
 kind text NOT NULL CHECK(kind IN ('oci','vercel')),digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'),storage_key text NOT NULL UNIQUE,
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 10737418240),retained boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(build_id,customer_id,project_id) REFERENCES webdock_auth.git_build(id,customer_id,project_id),UNIQUE(id,customer_id,project_id)
);
ALTER TABLE webdock_auth.git_artifact ADD COLUMN IF NOT EXISTS storage_purged_at timestamptz;
CREATE TABLE IF NOT EXISTS webdock_auth.git_release (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),customer_id varchar NOT NULL,project_id varchar NOT NULL,artifact_id varchar NOT NULL,
 status text NOT NULL DEFAULT 'awaiting-approval' CHECK(status IN ('awaiting-approval','queued','deploying','ready','failed','superseded','needs-reconciliation')),
 revision integer NOT NULL DEFAULT 1,source_revision integer NOT NULL,connection_generation integer NOT NULL,environment_revision integer NOT NULL,
 subject text NOT NULL,approved_by text,idempotency_key text,operation_id text,provider_deployment_id text,generation integer NOT NULL DEFAULT 0,lease_until timestamptz,
 worker_id varchar REFERENCES webdock_auth.git_worker(id),worker_generation integer,
 created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(artifact_id,customer_id,project_id) REFERENCES webdock_auth.git_artifact(id,customer_id,project_id),
 UNIQUE(project_id,idempotency_key)
);
ALTER TABLE webdock_auth.git_release ADD COLUMN IF NOT EXISTS worker_id varchar REFERENCES webdock_auth.git_worker(id);
ALTER TABLE webdock_auth.git_release ADD COLUMN IF NOT EXISTS worker_generation integer;
CREATE UNIQUE INDEX IF NOT EXISTS git_release_publication ON webdock_auth.git_release(project_id) WHERE status IN ('deploying','needs-reconciliation');
CREATE TABLE IF NOT EXISTS webdock_auth.git_receipt (
 delivery_id text PRIMARY KEY,event text NOT NULL,installation_id text NOT NULL,processed_at timestamptz,event_data jsonb,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE webdock_auth.git_release ADD COLUMN IF NOT EXISTS publication_started_at timestamptz;
ALTER TABLE webdock_auth.git_release ADD COLUMN IF NOT EXISTS publication_target jsonb;
-- Only matching source revisions can establish a legacy release's original target.
UPDATE webdock_auth.git_release r SET publication_target=jsonb_build_object('recipe',s.recipe,'targetID',s.target_id,'teamID',t.team_id)
FROM webdock_auth.git_source s LEFT JOIN webdock_auth.git_vercel_target t ON t.project_id=s.project_id AND t.customer_id=s.customer_id AND t.target_id=s.target_id
WHERE r.project_id=s.project_id AND r.customer_id=s.customer_id AND r.source_revision=s.revision AND r.publication_target IS NULL
AND (s.recipe='dockerfile' OR t.team_id IS NOT NULL);
ALTER TABLE webdock_auth.git_release ADD COLUMN IF NOT EXISTS approved_session_id text;
ALTER TABLE webdock_auth.git_release ADD COLUMN IF NOT EXISTS approved_source text;
ALTER TABLE webdock_auth.git_release ADD COLUMN IF NOT EXISTS approved_scopes jsonb;
ALTER TABLE webdock_auth.git_source ADD COLUMN IF NOT EXISTS environment_identity text;
ALTER TABLE webdock_auth.git_source ADD COLUMN IF NOT EXISTS auto_publish boolean NOT NULL DEFAULT false;
ALTER TABLE webdock_auth.git_source ADD COLUMN IF NOT EXISTS policy_subject text;
ALTER TABLE webdock_auth.git_source ADD COLUMN IF NOT EXISTS policy_revision integer;
ALTER TABLE webdock_auth.git_build ADD COLUMN IF NOT EXISTS environment_identity text;
ALTER TABLE webdock_auth.git_release ADD COLUMN IF NOT EXISTS environment_identity text;
ALTER TABLE webdock_auth.git_build ADD COLUMN IF NOT EXISTS target_revision integer;
ALTER TABLE webdock_auth.git_source ADD COLUMN IF NOT EXISTS build_environment_encrypted text;
ALTER TABLE webdock_auth.git_build ADD COLUMN IF NOT EXISTS provider_configuration_identity text;
CREATE TABLE IF NOT EXISTS webdock_auth.git_check_outbox (
 build_id varchar PRIMARY KEY REFERENCES webdock_auth.git_build(id),installation_id text NOT NULL,repository_id text NOT NULL,source_sha text NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','in_progress','completed')),conclusion text,
 check_id text,version integer NOT NULL DEFAULT 1,processed_version integer NOT NULL DEFAULT 0,
 generation integer NOT NULL DEFAULT 0,lease_until timestamptz,retry_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE webdock_auth.git_receipt ADD COLUMN IF NOT EXISTS event_data jsonb;
ALTER TABLE webdock_auth.git_receipt ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE webdock_auth.git_receipt ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE webdock_auth.git_receipt ADD COLUMN IF NOT EXISTS failure_code text;
ALTER TABLE webdock_auth.git_receipt ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE webdock_auth.git_receipt ALTER COLUMN processed_at DROP NOT NULL;
ALTER TABLE webdock_auth.git_receipt ALTER COLUMN processed_at DROP DEFAULT;
`;
