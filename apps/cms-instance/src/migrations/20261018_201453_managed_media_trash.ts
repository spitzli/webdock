import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "app"."media" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "app"."_media_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  CREATE INDEX "media_deleted_at_idx" ON "app"."media" USING btree ("deleted_at");
  CREATE INDEX "_media_v_version_version_deleted_at_idx" ON "app"."_media_v" USING btree ("version_deleted_at");`);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "app"."media_deleted_at_idx";
  DROP INDEX "app"."_media_v_version_version_deleted_at_idx";
  ALTER TABLE "app"."media" DROP COLUMN "deleted_at";
  ALTER TABLE "app"."_media_v" DROP COLUMN "version_deleted_at";`);
}
