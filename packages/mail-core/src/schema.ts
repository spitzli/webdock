export const nativeMailSchemaSQL = `
CREATE SCHEMA IF NOT EXISTS webdock_mail;
REVOKE ALL ON SCHEMA webdock_mail FROM PUBLIC;
CREATE TABLE IF NOT EXISTS webdock_mail.service (
 customer_id text PRIMARY KEY REFERENCES webdock_auth.tenant_customer(customer_id),
 instance_key text NOT NULL UNIQUE,
 host_id text NOT NULL,
 desired_enabled boolean NOT NULL DEFAULT false,
 state text NOT NULL CHECK (state IN ('pending','provisioning','ready','suspended','needs_review')),
 revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
 applied_revision bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webdock_mail.operation (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 customer_id text NOT NULL REFERENCES webdock_mail.service(customer_id),
 revision bigint NOT NULL,
 desired_enabled boolean NOT NULL,
 requested_by text NOT NULL REFERENCES webdock_auth."user"(id),
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','running','succeeded','superseded','needs_review')),
 lease_token text, lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 UNIQUE(customer_id, revision)
);
ALTER TABLE webdock_mail.operation ADD COLUMN IF NOT EXISTS agent_generation integer;
CREATE UNIQUE INDEX IF NOT EXISTS mail_operation_running ON webdock_mail.operation(customer_id) WHERE state='running';
CREATE INDEX IF NOT EXISTS mail_operation_due ON webdock_mail.operation(created_at) WHERE state='pending';
CREATE TABLE IF NOT EXISTS webdock_mail.instance (
 customer_id text PRIMARY KEY REFERENCES webdock_mail.service(customer_id),
 internal_url text, public_url text,
 encrypted_credentials text NOT NULL,
 verified_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export const nativeMailClusterSchemaSQL = `
CREATE TABLE IF NOT EXISTS webdock_mail.cluster_reservation (
 customer_id text PRIMARY KEY REFERENCES webdock_mail.service(customer_id),
 cluster_id varchar NOT NULL REFERENCES webdock_auth.hosting_cluster(id),
 demand jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('reserved','active'))
);`;

export function nativeMailGrants(authRole: string, workerRole?: string) {
  for (const role of workerRole === undefined ? [authRole] : [authRole, workerRole])
    if (typeof role !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(role)) throw new Error("Invalid Mail database role");
  if (authRole === workerRole) throw new Error("Mail worker and authentication roles must be separate");
  const managed = `GRANT USAGE ON SCHEMA webdock_mail TO "${authRole}";
GRANT SELECT,INSERT,UPDATE ON webdock_mail.service,webdock_mail.operation,webdock_mail.cluster_reservation,webdock_mail.instance TO "${authRole}";`;
  if (workerRole === undefined) return managed;
  return managed + `
GRANT USAGE ON SCHEMA webdock_mail TO "${workerRole}";
GRANT SELECT,UPDATE ON webdock_mail.service,webdock_mail.operation TO "${workerRole}";
GRANT SELECT,INSERT,UPDATE ON webdock_mail.instance TO "${workerRole}";
GRANT USAGE ON SCHEMA webdock_auth,webdock_admin TO "${workerRole}";
GRANT SELECT(id,status) ON webdock_admin.customers TO "${workerRole}";
GRANT SELECT(id,settings) ON webdock_auth.platform_settings TO "${workerRole}";`;
}
