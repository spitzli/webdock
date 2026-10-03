import { sql, type MigrateUpArgs } from '@payloadcms/db-postgres';
export async function up({db}: MigrateUpArgs) {
  await db.execute(sql`ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'member' BEFORE 'editor'; ALTER TYPE "enum__users_v_version_role" ADD VALUE IF NOT EXISTS 'member' BEFORE 'editor';`);
}
export async function down() { throw new Error('Use the pre-unified snapshot for rollback.'); }
