/** Additive offline migration. Never execute from request handlers or builds. */
export const mailProductSchemaSQL = `
ALTER TABLE webdock_auth.mail_sender_domain ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS mail_sender_domain_customer_id ON webdock_auth.mail_sender_domain(customer_id,id);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_connection (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 customer_id varchar NOT NULL REFERENCES webdock_auth.tenant_customer(customer_id),
 kind text NOT NULL CHECK(kind IN ('platform','byok')),
 provider_account_id text NOT NULL UNIQUE,
 region text NOT NULL DEFAULT 'eu' CHECK(region IN ('eu','global')),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','ready','paused','needs_review','disconnected')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(customer_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS mail_connection_active_source ON webdock_auth.mail_connection(customer_id,kind) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS webdock_auth.mail_connection_secret (
 customer_id varchar NOT NULL,connection_id text NOT NULL,version integer NOT NULL CHECK(version>0),
 encrypted_secret text NOT NULL,key_suffix text NOT NULL,active boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz,
 PRIMARY KEY(connection_id,version),
 FOREIGN KEY(customer_id,connection_id) REFERENCES webdock_auth.mail_connection(customer_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS mail_connection_active_secret ON webdock_auth.mail_connection_secret(connection_id) WHERE active;
CREATE TABLE IF NOT EXISTS webdock_auth.mail_provider_operation (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),customer_id varchar NOT NULL,connection_id text NOT NULL,
 label text NOT NULL UNIQUE,status text NOT NULL CHECK(status IN ('pending','needs_review','succeeded')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(customer_id,connection_id) REFERENCES webdock_auth.mail_connection(customer_id,id)
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_connection_domain (
 customer_id varchar NOT NULL,connection_id text NOT NULL,domain_id text NOT NULL,
 provider_id text,provider_snapshot jsonb NOT NULL DEFAULT '{}',provider_operation text,provider_checked_at timestamptz,
 PRIMARY KEY(connection_id,domain_id),
 FOREIGN KEY(customer_id,connection_id) REFERENCES webdock_auth.mail_connection(customer_id,id),
 FOREIGN KEY(customer_id,domain_id) REFERENCES webdock_auth.mail_sender_domain(customer_id,id)
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_api_key (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),customer_id varchar NOT NULL,connection_id text NOT NULL,
 name text NOT NULL,prefix text NOT NULL,key_hash text NOT NULL UNIQUE,
 permission text NOT NULL CHECK(permission IN ('sending_access','full_access')),domain_id text,
 created_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz,last_used_at timestamptz,
 UNIQUE(customer_id,connection_id,id),
 FOREIGN KEY(customer_id,connection_id) REFERENCES webdock_auth.mail_connection(customer_id,id),
 FOREIGN KEY(customer_id,domain_id) REFERENCES webdock_auth.mail_sender_domain(customer_id,id)
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_message (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),customer_id varchar NOT NULL,connection_id text NOT NULL,domain_id text NOT NULL,
 principal jsonb NOT NULL DEFAULT '{}',from_address text NOT NULL,subject text NOT NULL,
 dispatch_status text NOT NULL CHECK(dispatch_status IN ('scheduled','dispatching','accepted','failed','outcome_unknown','canceled','suppressed')),
 scheduled_at timestamptz,accepted_at timestamptz,terminal_at timestamptz,
 provider_mid text,provider_reference uuid NOT NULL UNIQUE,revision bigint NOT NULL DEFAULT 1,
 simulated boolean NOT NULL DEFAULT false,error_code text,claim_token uuid,lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(customer_id,connection_id,id),
 FOREIGN KEY(customer_id,connection_id) REFERENCES webdock_auth.mail_connection(customer_id,id),
 FOREIGN KEY(customer_id,domain_id) REFERENCES webdock_auth.mail_sender_domain(customer_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS mail_message_provider_mid_unique ON webdock_auth.mail_message(connection_id,provider_mid) WHERE provider_mid IS NOT NULL;
CREATE INDEX IF NOT EXISTS mail_message_list ON webdock_auth.mail_message(customer_id,connection_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS mail_message_due ON webdock_auth.mail_message(scheduled_at,id) WHERE dispatch_status='scheduled';
CREATE TABLE IF NOT EXISTS webdock_auth.mail_message_content (
 customer_id varchar NOT NULL,connection_id text NOT NULL,message_id text PRIMARY KEY,
 text_body text,html_body text,headers jsonb NOT NULL DEFAULT '{}',tags jsonb NOT NULL DEFAULT '[]',
 reply_to jsonb NOT NULL DEFAULT '[]',attachment_metadata jsonb NOT NULL DEFAULT '[]',encrypted_attachments text,expires_at timestamptz,
 FOREIGN KEY(customer_id,connection_id,message_id) REFERENCES webdock_auth.mail_message(customer_id,connection_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_recipient (
 customer_id varchar NOT NULL,connection_id text NOT NULL,message_id text NOT NULL,email text NOT NULL,
 category text NOT NULL CHECK(category IN ('to','cc','bcc')),suppression_reason text,
 delivery_status text NOT NULL DEFAULT 'pending' CHECK(delivery_status IN ('pending','deferred','delivered','bounced','failed','suppressed')),
 complained_at timestamptz,unsubscribed_at timestamptz,first_open_at timestamptz,last_open_at timestamptz,first_click_at timestamptz,last_click_at timestamptz,
 PRIMARY KEY(message_id,email),
 FOREIGN KEY(customer_id,connection_id,message_id) REFERENCES webdock_auth.mail_message(customer_id,connection_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_event (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),customer_id varchar NOT NULL,connection_id text NOT NULL,
 resource_id text NOT NULL,message_id text,recipient text,type text NOT NULL,source text NOT NULL,
 dedupe_key text NOT NULL,details jsonb NOT NULL DEFAULT '{}',occurred_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(connection_id,dedupe_key),UNIQUE(customer_id,connection_id,id),
 FOREIGN KEY(customer_id,connection_id) REFERENCES webdock_auth.mail_connection(customer_id,id),
 FOREIGN KEY(customer_id,connection_id,message_id) REFERENCES webdock_auth.mail_message(customer_id,connection_id,id)
);
CREATE INDEX IF NOT EXISTS mail_event_resource ON webdock_auth.mail_event(customer_id,connection_id,resource_id,occurred_at,id);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_callback_source (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),secret_hash text NOT NULL UNIQUE,
 kind text NOT NULL CHECK(kind IN ('account','parent')),enabled boolean NOT NULL DEFAULT true,verified_at timestamptz,last_seen_at timestamptz
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_callback_source_connection (
 source_id text NOT NULL REFERENCES webdock_auth.mail_callback_source(id),connection_id text NOT NULL REFERENCES webdock_auth.mail_connection(id),
 PRIMARY KEY(source_id,connection_id)
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_callback_inbox (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),source_id text NOT NULL REFERENCES webdock_auth.mail_callback_source(id),
 payload jsonb NOT NULL,dedupe_key text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','processed','quarantined')),
 attempts integer NOT NULL DEFAULT 0,claim_token uuid,lease_until timestamptz,created_at timestamptz NOT NULL DEFAULT now(),processed_at timestamptz,
 UNIQUE(source_id,dedupe_key)
);
CREATE INDEX IF NOT EXISTS mail_callback_due ON webdock_auth.mail_callback_inbox(created_at,id) WHERE status IN ('pending','quarantined');
CREATE TABLE IF NOT EXISTS webdock_auth.mail_suppression (
 customer_id varchar NOT NULL REFERENCES webdock_auth.tenant_customer(customer_id),email text NOT NULL,
 reason text NOT NULL CHECK(reason IN ('manual','bounced','complained','unsubscribed')),source text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(customer_id,email)
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_webhook (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),customer_id varchar NOT NULL,connection_id text NOT NULL,
 url text NOT NULL,events jsonb NOT NULL,encrypted_secret text NOT NULL,version integer NOT NULL DEFAULT 1,
 enabled boolean NOT NULL DEFAULT true,deleted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(customer_id,connection_id,id),
 FOREIGN KEY(customer_id,connection_id) REFERENCES webdock_auth.mail_connection(customer_id,id)
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_webhook_delivery (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),customer_id varchar NOT NULL,connection_id text NOT NULL,
 webhook_id text NOT NULL,event_id text NOT NULL,body text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivering','succeeded','failed','canceled')),
 attempts integer NOT NULL DEFAULT 0,next_at timestamptz NOT NULL DEFAULT now(),claim_token uuid,lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 UNIQUE(webhook_id,event_id),UNIQUE(customer_id,connection_id,id),
 FOREIGN KEY(customer_id,connection_id,webhook_id) REFERENCES webdock_auth.mail_webhook(customer_id,connection_id,id),
 FOREIGN KEY(customer_id,connection_id,event_id) REFERENCES webdock_auth.mail_event(customer_id,connection_id,id)
);
CREATE INDEX IF NOT EXISTS mail_webhook_due ON webdock_auth.mail_webhook_delivery(next_at,id) WHERE status IN ('pending','delivering');
CREATE TABLE IF NOT EXISTS webdock_auth.mail_webhook_attempt (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),customer_id varchar NOT NULL,connection_id text NOT NULL,delivery_id text NOT NULL,
 http_status integer,response text,error_code text,duration_ms integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(customer_id,connection_id,delivery_id) REFERENCES webdock_auth.mail_webhook_delivery(customer_id,connection_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_batch (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),customer_id varchar NOT NULL,connection_id text NOT NULL,
 status text NOT NULL DEFAULT 'processing' CHECK(status IN ('processing','succeeded','failed')),failed_index integer,failed_email_id text,
 created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,UNIQUE(customer_id,connection_id,id),
 FOREIGN KEY(customer_id,connection_id) REFERENCES webdock_auth.mail_connection(customer_id,id)
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_batch_item (
 customer_id varchar NOT NULL,connection_id text NOT NULL,batch_id text NOT NULL,item_index integer NOT NULL CHECK(item_index>=0 AND item_index<100),
 message_id text,status text NOT NULL CHECK(status IN ('pending','accepted','failed','not_sent')),result jsonb,
 PRIMARY KEY(batch_id,item_index),
 FOREIGN KEY(customer_id,connection_id,batch_id) REFERENCES webdock_auth.mail_batch(customer_id,connection_id,id),
 FOREIGN KEY(customer_id,connection_id,message_id) REFERENCES webdock_auth.mail_message(customer_id,connection_id,id)
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_idempotency (
 customer_id varchar NOT NULL,connection_id text NOT NULL,key text NOT NULL,
 method text NOT NULL,path text NOT NULL,body_hash text NOT NULL,status text NOT NULL CHECK(status IN ('pending','unknown','completed')),
 response_status integer,response_body jsonb,message_id text,batch_id text,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz,
 PRIMARY KEY(customer_id,connection_id,key),
 FOREIGN KEY(customer_id,connection_id) REFERENCES webdock_auth.mail_connection(customer_id,id),
 FOREIGN KEY(customer_id,connection_id,message_id) REFERENCES webdock_auth.mail_message(customer_id,connection_id,id),
 FOREIGN KEY(customer_id,connection_id,batch_id) REFERENCES webdock_auth.mail_batch(customer_id,connection_id,id),
 CHECK(status='completed' OR expires_at IS NULL)
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_usage_period (
 customer_id varchar NOT NULL,connection_id text NOT NULL,period date NOT NULL,budget bigint CHECK(budget>=0),
 reserved bigint NOT NULL DEFAULT 0 CHECK(reserved>=0),consumed bigint NOT NULL DEFAULT 0 CHECK(consumed>=0),
 PRIMARY KEY(customer_id,connection_id,period),FOREIGN KEY(customer_id,connection_id) REFERENCES webdock_auth.mail_connection(customer_id,id)
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_usage_reservation (
 customer_id varchar NOT NULL,connection_id text NOT NULL,message_id text PRIMARY KEY,period date NOT NULL,
 recipients integer NOT NULL CHECK(recipients>0 AND recipients<=50),status text NOT NULL CHECK(status IN ('reserved','consumed','released')),
 FOREIGN KEY(customer_id,connection_id,period) REFERENCES webdock_auth.mail_usage_period(customer_id,connection_id,period),
 FOREIGN KEY(customer_id,connection_id,message_id) REFERENCES webdock_auth.mail_message(customer_id,connection_id,id)
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_rate_window (
 customer_id varchar NOT NULL REFERENCES webdock_auth.tenant_customer(customer_id),kind text NOT NULL,window_start timestamptz NOT NULL,
 count integer NOT NULL CHECK(count>=0),PRIMARY KEY(customer_id,kind,window_start)
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_request_log (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),customer_id varchar NOT NULL,connection_id text NOT NULL,key_id text,
 route text NOT NULL,method text NOT NULL,status integer NOT NULL,duration_ms integer NOT NULL,request_id text NOT NULL,
 request_body jsonb,response_body jsonb,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(customer_id,connection_id) REFERENCES webdock_auth.mail_connection(customer_id,id),
 FOREIGN KEY(customer_id,connection_id,key_id) REFERENCES webdock_auth.mail_api_key(customer_id,connection_id,id)
);
CREATE INDEX IF NOT EXISTS mail_request_log_list ON webdock_auth.mail_request_log(customer_id,connection_id,created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_job_lease (
 name text PRIMARY KEY,claim_token uuid NOT NULL,lease_until timestamptz NOT NULL,cursor text
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_job_run (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),name text NOT NULL,started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,status text NOT NULL,counts jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_import_map (
 source text NOT NULL,kind text NOT NULL,legacy_id text NOT NULL,customer_id varchar NOT NULL,connection_id text NOT NULL,
 target_id text NOT NULL,checksum text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source,kind,legacy_id),FOREIGN KEY(customer_id,connection_id) REFERENCES webdock_auth.mail_connection(customer_id,id)
);
`;

export const mailProductDomainSchemaSQL = `
ALTER TABLE webdock_auth.mail_sender_domain ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE webdock_auth.mail_sender_domain DROP CONSTRAINT IF EXISTS mail_sender_domain_customer_id_domain_key;
DROP INDEX IF EXISTS webdock_auth.mail_verified_domain;
CREATE UNIQUE INDEX mail_verified_domain ON webdock_auth.mail_sender_domain(domain) WHERE status='ownership_verified' AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mail_sender_domain_live_claim ON webdock_auth.mail_sender_domain(customer_id,domain) WHERE deleted_at IS NULL;
ALTER TABLE webdock_auth.mail_tracking_domain ADD COLUMN IF NOT EXISTS connection_id text REFERENCES webdock_auth.mail_connection(id);
`;

export const mailProductDispatchSchemaSQL = `
ALTER TABLE webdock_auth.mail_idempotency ADD COLUMN IF NOT EXISTS operation_token uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE webdock_auth.mail_recipient ADD COLUMN IF NOT EXISTS first_delivered_at timestamptz;
`;

export const mailProductQueueSchemaSQL = `
ALTER TABLE webdock_auth.mail_message ADD COLUMN IF NOT EXISTS handoff_started_at timestamptz;
ALTER TABLE webdock_auth.mail_message ADD COLUMN IF NOT EXISTS blocked_reason text;
ALTER TABLE webdock_auth.mail_recipient ADD COLUMN IF NOT EXISTS included_in_handoff boolean NOT NULL DEFAULT false;
ALTER TABLE webdock_auth.mail_batch ADD COLUMN IF NOT EXISTS claim_token uuid;
ALTER TABLE webdock_auth.mail_batch ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE webdock_auth.mail_callback_source ADD COLUMN IF NOT EXISTS rate_window timestamptz;
ALTER TABLE webdock_auth.mail_callback_source ADD COLUMN IF NOT EXISTS rate_count integer NOT NULL DEFAULT 0;
`;
export const mailProductTrackingSchemaSQL = `
CREATE TABLE IF NOT EXISTS webdock_auth.mail_connection_tracking_settings (
 customer_id varchar NOT NULL,connection_id text NOT NULL,snapshot jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(connection_id),FOREIGN KEY(customer_id,connection_id) REFERENCES webdock_auth.mail_connection(customer_id,id)
);
ALTER TABLE webdock_auth.mail_tracking_domain DROP CONSTRAINT IF EXISTS mail_tracking_domain_customer_id_provider_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS mail_tracking_provider_per_connection ON webdock_auth.mail_tracking_domain(connection_id,provider_id) WHERE connection_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mail_tracking_provider_legacy ON webdock_auth.mail_tracking_domain(customer_id,provider_id) WHERE connection_id IS NULL;
`;
export const mailProductRetentionIndexSQL = `
CREATE INDEX IF NOT EXISTS mail_event_message ON webdock_auth.mail_event(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mail_event_retention ON webdock_auth.mail_event(created_at,id);
CREATE INDEX IF NOT EXISTS mail_webhook_attempt_delivery ON webdock_auth.mail_webhook_attempt(delivery_id,created_at,id);
CREATE INDEX IF NOT EXISTS mail_delivery_event ON webdock_auth.mail_webhook_delivery(event_id);
CREATE INDEX IF NOT EXISTS mail_delivery_retention ON webdock_auth.mail_webhook_delivery(finished_at,id) WHERE status IN ('succeeded','failed','canceled');
CREATE INDEX IF NOT EXISTS mail_batch_item_message ON webdock_auth.mail_batch_item(message_id);
CREATE INDEX IF NOT EXISTS mail_idempotency_message ON webdock_auth.mail_idempotency(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mail_idempotency_batch ON webdock_auth.mail_idempotency(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mail_idempotency_retention ON webdock_auth.mail_idempotency(expires_at) WHERE status='completed';
CREATE INDEX IF NOT EXISTS mail_message_retention ON webdock_auth.mail_message(terminal_at,id) WHERE terminal_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS mail_content_retention ON webdock_auth.mail_message_content(expires_at,message_id) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS mail_callback_processed ON webdock_auth.mail_callback_inbox(processed_at,id) WHERE status='processed';
CREATE INDEX IF NOT EXISTS mail_request_log_retention ON webdock_auth.mail_request_log(created_at,id);
`;
export const mailProductMigrations = [
 ['2026-10-12-mail-product-v1',mailProductSchemaSQL],
 ['2026-10-12-mail-product-domains-v1',mailProductDomainSchemaSQL],
 ['2026-10-12-mail-product-dispatch-v1',mailProductDispatchSchemaSQL],
 ['2026-10-12-mail-product-queue-v1',mailProductQueueSchemaSQL],
 ['2026-10-12-mail-product-tracking-v1',mailProductTrackingSchemaSQL],
 ['2026-10-12-mail-product-retention-index-v1',mailProductRetentionIndexSQL],
] as const;
