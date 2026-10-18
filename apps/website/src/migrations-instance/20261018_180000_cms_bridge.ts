import {
  type MigrateUpArgs,
  type MigrateDownArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "webdock"."users" ADD COLUMN "disabled" boolean DEFAULT false;
    CREATE TABLE "webdock"."cms_bridge_transfers" (
      "id" uuid PRIMARY KEY,
      "instance" text NOT NULL, "project" text NOT NULL, "subject" text NOT NULL,
      "role" text NOT NULL CHECK (role IN ('reader','editor','admin','operator')),
      "grant_epoch" text NOT NULL, "expires" bigint NOT NULL,
      "size" integer NOT NULL CHECK (size >= 0), "sha256" text NOT NULL,
      "kind" text NOT NULL CHECK (kind IN ('json','media')),
      "offset" integer NOT NULL DEFAULT 0 CHECK ("offset" >= 0 AND "offset" <= size),
      "state" text NOT NULL CHECK (state IN ('uploading','executing','complete')),
      "disposable" boolean NOT NULL DEFAULT false,
      "response" bytea, "result" jsonb
    );
    CREATE INDEX "cms_bridge_transfers_scope_expiry_idx" ON "webdock"."cms_bridge_transfers" ("instance","project","expires");
    CREATE TABLE "webdock"."cms_bridge_transfer_chunks" (
      "transfer" uuid NOT NULL REFERENCES "webdock"."cms_bridge_transfers"("id") ON DELETE CASCADE,
      "offset" integer NOT NULL CHECK ("offset" >= 0),
      "data" bytea NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 16384),
      PRIMARY KEY ("transfer", "offset")
    );
    REVOKE ALL ON "webdock"."cms_bridge_transfers", "webdock"."cms_bridge_transfer_chunks" FROM PUBLIC;
    -- Managed platform ownership identifies the website scope; standalone owners keep their own policy model.
    DO $permissions$ DECLARE bridge_table text; BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner
        WHERE n.nspname = 'webdock' AND r.rolname = 'webdock_website_owner'
      ) THEN
        FOREACH bridge_table IN ARRAY ARRAY['cms_bridge_transfers', 'cms_bridge_transfer_chunks'] LOOP
          EXECUTE format('ALTER TABLE webdock.%I OWNER TO webdock_website_owner', bridge_table);
          EXECUTE format('ALTER TABLE webdock.%I ENABLE ROW LEVEL SECURITY', bridge_table);
          EXECUTE format('ALTER TABLE webdock.%I FORCE ROW LEVEL SECURITY', bridge_table);
          EXECUTE format('CREATE POLICY website_owner ON webdock.%I TO webdock_website_owner USING(true) WITH CHECK(true)', bridge_table);
          EXECUTE format('CREATE POLICY website_runtime ON webdock.%I TO webdock_runtime USING(true) WITH CHECK(true)', bridge_table);
          EXECUTE format('CREATE POLICY website_browser ON webdock.%I TO webdock_browser_website USING(true) WITH CHECK(true)', bridge_table);
          EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON webdock.%I TO webdock_runtime,webdock_browser_website', bridge_table);
        END LOOP;
      END IF;
    END $permissions$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql`DROP TABLE "webdock"."cms_bridge_transfer_chunks"; DROP TABLE "webdock"."cms_bridge_transfers"; ALTER TABLE "webdock"."users" DROP COLUMN "disabled";`,
  );
}
