import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_stall_form_submissions_delivery_status" AS ENUM('pending', 'sent', 'failed');
  CREATE TYPE "public"."enum__stall_form_submissions_v_version_delivery_status" AS ENUM('pending', 'sent', 'failed');
  ALTER TYPE "public"."enum_sites_locales" RENAME TO "enum_sites_languages";
  ALTER TYPE "public"."enum__sites_v_version_locales" RENAME TO "enum__sites_v_version_languages";
  CREATE TABLE "form_limits" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" varchar NOT NULL,
    "hits" numeric NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL
  );

  ALTER TABLE "sites_locales" RENAME TO "sites_languages";
  ALTER TABLE "_sites_v_version_locales" RENAME TO "_sites_v_version_languages";
  ALTER TABLE "sites_languages" DROP CONSTRAINT "sites_locales_parent_fk";

  ALTER TABLE "_sites_v_version_languages" DROP CONSTRAINT "_sites_v_version_locales_parent_fk";

  DROP INDEX "sites_locales_order_idx";
  DROP INDEX "sites_locales_parent_idx";
  DROP INDEX "_sites_v_version_locales_order_idx";
  DROP INDEX "_sites_v_version_locales_parent_idx";
  ALTER TABLE "stall_form_submissions" ADD COLUMN "delivery_status" "enum_stall_form_submissions_delivery_status" DEFAULT 'pending' NOT NULL;
  ALTER TABLE "_stall_form_submissions_v" ADD COLUMN "version_delivery_status" "enum__stall_form_submissions_v_version_delivery_status" DEFAULT 'pending' NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "form_limits_id" integer;
  CREATE UNIQUE INDEX "form_limits_key_idx" ON "form_limits" USING btree ("key");
  CREATE INDEX "form_limits_expires_at_idx" ON "form_limits" USING btree ("expires_at");
  ALTER TABLE "sites_languages" ADD CONSTRAINT "sites_languages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_sites_v_version_languages" ADD CONSTRAINT "_sites_v_version_languages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_sites_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_form_limits_fk" FOREIGN KEY ("form_limits_id") REFERENCES "public"."form_limits"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "sites_languages_order_idx" ON "sites_languages" USING btree ("order");
  CREATE INDEX "sites_languages_parent_idx" ON "sites_languages" USING btree ("parent_id");
  CREATE INDEX "_sites_v_version_languages_order_idx" ON "_sites_v_version_languages" USING btree ("order");
  CREATE INDEX "_sites_v_version_languages_parent_idx" ON "_sites_v_version_languages" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_form_limits_id_idx" ON "payload_locked_documents_rels" USING btree ("form_limits_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_sites_languages" RENAME TO "enum_sites_locales";
  ALTER TYPE "public"."enum__sites_v_version_languages" RENAME TO "enum__sites_v_version_locales";
  ALTER TABLE "form_limits" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "form_limits" CASCADE;
  ALTER TABLE "sites_languages" RENAME TO "sites_locales";
  ALTER TABLE "_sites_v_version_languages" RENAME TO "_sites_v_version_locales";
  ALTER TABLE "sites_locales" DROP CONSTRAINT "sites_languages_parent_fk";

  ALTER TABLE "_sites_v_version_locales" DROP CONSTRAINT "_sites_v_version_languages_parent_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_form_limits_fk";

  DROP INDEX "sites_languages_order_idx";
  DROP INDEX "sites_languages_parent_idx";
  DROP INDEX "_sites_v_version_languages_order_idx";
  DROP INDEX "_sites_v_version_languages_parent_idx";
  DROP INDEX "payload_locked_documents_rels_form_limits_id_idx";
  ALTER TABLE "sites_locales" ADD CONSTRAINT "sites_locales_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_sites_v_version_locales" ADD CONSTRAINT "_sites_v_version_locales_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_sites_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "sites_locales_order_idx" ON "sites_locales" USING btree ("order");
  CREATE INDEX "sites_locales_parent_idx" ON "sites_locales" USING btree ("parent_id");
  CREATE INDEX "_sites_v_version_locales_order_idx" ON "_sites_v_version_locales" USING btree ("order");
  CREATE INDEX "_sites_v_version_locales_parent_idx" ON "_sites_v_version_locales" USING btree ("parent_id");
  ALTER TABLE "stall_form_submissions" DROP COLUMN "delivery_status";
  ALTER TABLE "_stall_form_submissions_v" DROP COLUMN "version_delivery_status";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "form_limits_id";
  DROP TYPE "public"."enum_stall_form_submissions_delivery_status";
  DROP TYPE "public"."enum__stall_form_submissions_v_version_delivery_status";`)
}
