import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ADD COLUMN "api_key" varchar;
  ALTER TABLE "users" ADD COLUMN "api_key_last4" varchar;
  ALTER TABLE "users" ADD COLUMN "api_key_index" varchar;
  ALTER TABLE "_users_v" ADD COLUMN "version_api_key" varchar;
  ALTER TABLE "_users_v" ADD COLUMN "version_api_key_last4" varchar;
  ALTER TABLE "_users_v" ADD COLUMN "version_api_key_index" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN "api_key";
  ALTER TABLE "users" DROP COLUMN "api_key_last4";
  ALTER TABLE "users" DROP COLUMN "api_key_index";
  ALTER TABLE "_users_v" DROP COLUMN "version_api_key";
  ALTER TABLE "_users_v" DROP COLUMN "version_api_key_last4";
  ALTER TABLE "_users_v" DROP COLUMN "version_api_key_index";`)
}
