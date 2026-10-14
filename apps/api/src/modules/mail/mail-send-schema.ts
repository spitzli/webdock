export const mailSendSchemaSQL = `
CREATE TABLE IF NOT EXISTS webdock_mail.api_key (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 customer_id text NOT NULL REFERENCES webdock_auth.tenant_customer(customer_id),
 label text NOT NULL,token_hash text NOT NULL UNIQUE,key_suffix text NOT NULL,
 domain_restricted boolean NOT NULL DEFAULT false,
 domain_id text REFERENCES webdock_auth.mail_sender_domain(id) ON DELETE SET NULL,
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS native_mail_key_customer ON webdock_mail.api_key(customer_id);
CREATE TABLE IF NOT EXISTS webdock_mail.send_transport (
 customer_id text PRIMARY KEY REFERENCES webdock_auth.tenant_customer(customer_id),
 mode text NOT NULL CHECK(mode IN ('managed','byok')),
 revision bigint NOT NULL DEFAULT 1,
 state text NOT NULL CHECK(state IN ('pending','ready','needs_review','disabled')),
 region text NOT NULL CHECK(region IN ('eu','global')),
 provider_account_id text,encrypted_credentials text,byok_revision integer,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE webdock_mail.send_transport ADD COLUMN IF NOT EXISTS pending_token uuid;
ALTER TABLE webdock_mail.instance ADD COLUMN IF NOT EXISTS submission_resource_ids jsonb;
ALTER TABLE webdock_mail.instance ADD COLUMN IF NOT EXISTS submission_state text;
ALTER TABLE webdock_mail.instance ADD COLUMN IF NOT EXISTS encrypted_submission_credentials text;
ALTER TABLE webdock_mail.instance ADD COLUMN IF NOT EXISTS submission_hook_token_hash text;
ALTER TABLE webdock_mail.instance ADD COLUMN IF NOT EXISTS submission_transport_revision bigint;
ALTER TABLE webdock_mail.instance ADD COLUMN IF NOT EXISTS submission_ready_revision bigint;
`;
export function mailSendGrants(role: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(role))
    throw Error("Invalid Mail database role");
  return `GRANT SELECT,INSERT,UPDATE ON webdock_mail.api_key,webdock_mail.send_transport TO "${role}";`;
}
