// Installed by offline migration and disposable fixtures, never by requests.
export const setupSchemaSQL = `
CREATE UNIQUE INDEX IF NOT EXISTS projects_customer_identity ON webdock_admin.projects(id,customer_id);
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_setup (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 customer_id varchar NOT NULL REFERENCES webdock_admin.customers(id),
 project_id varchar NOT NULL REFERENCES webdock_admin.projects(id),
 subject text NOT NULL,actor jsonb,configuration jsonb NOT NULL,environment_encrypted text,
 revision integer NOT NULL DEFAULT 1,state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','awaiting-confirmation','running','blocked','failed','ready')),
 preview jsonb,confirmed_preview_id text,resources jsonb NOT NULL DEFAULT '{}',steps jsonb NOT NULL DEFAULT '[]',reason text,
 generation integer NOT NULL DEFAULT 0,lease_until timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT hosting_setup_project_customer_fk FOREIGN KEY(project_id,customer_id) REFERENCES webdock_admin.projects(id,customer_id)
);
CREATE INDEX IF NOT EXISTS hosting_setup_due ON webdock_auth.hosting_setup(next_attempt_at) WHERE state='running';
`;
