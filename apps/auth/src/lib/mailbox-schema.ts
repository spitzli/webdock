/** Additive control metadata only; message bodies stay in Stalwart. */
export const mailboxSchemaSQL = `
CREATE UNIQUE INDEX IF NOT EXISTS mail_sender_domain_tenant_id ON webdock_auth.mail_sender_domain(customer_id,id);
CREATE TABLE IF NOT EXISTS webdock_mail.domain (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 customer_id text NOT NULL REFERENCES webdock_mail.service(customer_id),
 sender_domain_id text NOT NULL UNIQUE REFERENCES webdock_auth.mail_sender_domain(id) ON DELETE RESTRICT,
 name text NOT NULL UNIQUE,
 provider_id text,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','ready','needs_review')),
 UNIQUE(customer_id,id)
);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='mail_domain_sender_tenant' AND conrelid='webdock_mail.domain'::regclass) THEN
  ALTER TABLE webdock_mail.domain ADD CONSTRAINT mail_domain_sender_tenant FOREIGN KEY(customer_id,sender_domain_id) REFERENCES webdock_auth.mail_sender_domain(customer_id,id);
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS mail_domain_provider ON webdock_mail.domain(customer_id,provider_id) WHERE provider_id IS NOT NULL;
ALTER TABLE webdock_mail.domain ADD COLUMN IF NOT EXISTS dkim_keys jsonb NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS webdock_mail.mailbox (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 customer_id text NOT NULL REFERENCES webdock_mail.service(customer_id),
 domain_id text NOT NULL,
 local_part text NOT NULL,
 name text NOT NULL,
 quota_bytes bigint NOT NULL CHECK(quota_bytes BETWEEN 1048576 AND 1099511627776),
 provider_id text,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','ready','needs_review')),
 enabled boolean NOT NULL DEFAULT true,
 UNIQUE(domain_id,local_part), UNIQUE(customer_id,id),
 FOREIGN KEY(customer_id,domain_id) REFERENCES webdock_mail.domain(customer_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS mail_mailbox_provider ON webdock_mail.mailbox(customer_id,provider_id) WHERE provider_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS webdock_mail.identity (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 customer_id text NOT NULL REFERENCES webdock_mail.service(customer_id),
 subject text NOT NULL REFERENCES webdock_auth."user"(id),
 provider_id text,
 encrypted_credentials text,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','ready','needs_review')),
 UNIQUE(customer_id,subject), UNIQUE(customer_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS mail_identity_provider ON webdock_mail.identity(customer_id,provider_id) WHERE provider_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS webdock_mail.mailbox_grant (
 customer_id text NOT NULL,
 mailbox_id text NOT NULL,
 subject text NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 revision bigint NOT NULL DEFAULT 1,
 PRIMARY KEY(mailbox_id,subject),
 FOREIGN KEY(customer_id,mailbox_id) REFERENCES webdock_mail.mailbox(customer_id,id),
 FOREIGN KEY(customer_id,subject) REFERENCES webdock_mail.identity(customer_id,subject)
);
ALTER TABLE webdock_mail.mailbox_grant ADD COLUMN IF NOT EXISTS member_id text REFERENCES webdock_auth.member(id) ON DELETE SET NULL;
ALTER TABLE webdock_mail.mailbox_grant ADD COLUMN IF NOT EXISTS operator_grant boolean NOT NULL DEFAULT false;
ALTER TABLE webdock_mail.mailbox_grant ADD COLUMN IF NOT EXISTS applied_revision bigint NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS webdock_mail.configuration (
 customer_id text PRIMARY KEY REFERENCES webdock_mail.service(customer_id),
 revision bigint NOT NULL DEFAULT 1,
 applied_revision bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS webdock_mail.configuration_operation (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 customer_id text NOT NULL REFERENCES webdock_mail.service(customer_id),
 revision bigint NOT NULL,
 requested_by text REFERENCES webdock_auth."user"(id),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','succeeded','superseded','needs_review')),
 lease_token text,lease_until timestamptz,agent_generation integer,
 created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 UNIQUE(customer_id,revision)
);
ALTER TABLE webdock_mail.configuration_operation ALTER COLUMN requested_by DROP NOT NULL;
ALTER TABLE webdock_mail.configuration_operation ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT 'management';
ALTER TABLE webdock_mail.configuration_operation ADD COLUMN IF NOT EXISTS desired jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS mail_configuration_running ON webdock_mail.configuration_operation(customer_id) WHERE state='running';
CREATE TABLE IF NOT EXISTS webdock_mail.access_event (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 customer_id text NOT NULL REFERENCES webdock_mail.service(customer_id),
 subject text NOT NULL REFERENCES webdock_auth."user"(id),
 action text NOT NULL,target_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webdock_mail.webmail_launch (
 token_hash text PRIMARY KEY,
 customer_id text NOT NULL,
 mailbox_id text NOT NULL,
 subject text NOT NULL,
 session_id text NOT NULL REFERENCES webdock_auth.session(id) ON DELETE CASCADE,
 grant_revision bigint NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 FOREIGN KEY(customer_id,mailbox_id) REFERENCES webdock_mail.mailbox(customer_id,id),
 FOREIGN KEY(mailbox_id,subject) REFERENCES webdock_mail.mailbox_grant(mailbox_id,subject)
);
CREATE TABLE IF NOT EXISTS webdock_mail.webmail_session (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 token_hash text NOT NULL UNIQUE,
 customer_id text NOT NULL,
 mailbox_id text NOT NULL,
 subject text NOT NULL,
 session_id text NOT NULL REFERENCES webdock_auth.session(id) ON DELETE CASCADE,
 grant_revision bigint NOT NULL,
 expires_at timestamptz NOT NULL,
 FOREIGN KEY(customer_id,mailbox_id) REFERENCES webdock_mail.mailbox(customer_id,id),
 FOREIGN KEY(mailbox_id,subject) REFERENCES webdock_mail.mailbox_grant(mailbox_id,subject)
);
CREATE INDEX IF NOT EXISTS webmail_launch_expiry ON webdock_mail.webmail_launch(expires_at);
CREATE INDEX IF NOT EXISTS webmail_session_expiry ON webdock_mail.webmail_session(expires_at);
CREATE TABLE IF NOT EXISTS webdock_mail.webmail_write (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 customer_id text NOT NULL,
 mailbox_id text NOT NULL,
 subject text NOT NULL REFERENCES webdock_auth."user"(id),
 request_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('draft','submit','update')),
 resource_id text,
 payload_hash text NOT NULL,
 lease_token uuid NOT NULL,
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','succeeded','rejected','uncertain')),
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 UNIQUE(mailbox_id,subject,request_id),
 FOREIGN KEY(customer_id,mailbox_id) REFERENCES webdock_mail.mailbox(customer_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS webmail_single_submission ON webdock_mail.webmail_write(mailbox_id,resource_id) WHERE action='submit';

CREATE OR REPLACE FUNCTION webdock_mail.revoke_detached_member() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE next_revision bigint;
BEGIN
 IF TG_WHEN='BEFORE' THEN
  NEW.enabled := false;
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
 END IF;
 INSERT INTO webdock_mail.configuration(customer_id) VALUES(NEW.customer_id)
 ON CONFLICT(customer_id) DO UPDATE SET revision=configuration.revision+1 RETURNING revision INTO next_revision;
 UPDATE webdock_mail.configuration_operation SET state='superseded',finished_at=now() WHERE customer_id=NEW.customer_id AND state='pending';
 INSERT INTO webdock_mail.configuration_operation(customer_id,revision,requested_by,reason) VALUES(NEW.customer_id,next_revision,NULL,'membership_revoked');
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS mail_member_detached_before ON webdock_mail.mailbox_grant;
CREATE TRIGGER mail_member_detached_before BEFORE UPDATE OF member_id ON webdock_mail.mailbox_grant
 FOR EACH ROW WHEN (OLD.member_id IS NOT NULL AND NEW.member_id IS NULL) EXECUTE FUNCTION webdock_mail.revoke_detached_member();
DROP TRIGGER IF EXISTS mail_member_detached_after ON webdock_mail.mailbox_grant;
CREATE TRIGGER mail_member_detached_after AFTER UPDATE OF member_id ON webdock_mail.mailbox_grant
 FOR EACH ROW WHEN (OLD.member_id IS NOT NULL AND NEW.member_id IS NULL) EXECUTE FUNCTION webdock_mail.revoke_detached_member();
`;

export function mailboxGrants(authRole: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(authRole)) throw Error("Invalid Mail database role");
  return `GRANT SELECT,INSERT,UPDATE ON webdock_mail.domain,webdock_mail.mailbox,webdock_mail.identity,webdock_mail.mailbox_grant,webdock_mail.configuration,webdock_mail.configuration_operation TO "${authRole}";
GRANT SELECT,INSERT ON webdock_mail.access_event TO "${authRole}";
GRANT SELECT,INSERT,UPDATE ON webdock_mail.webmail_write TO "${authRole}";
GRANT SELECT,INSERT,UPDATE,DELETE ON webdock_mail.webmail_launch,webdock_mail.webmail_session TO "${authRole}";`;
}
