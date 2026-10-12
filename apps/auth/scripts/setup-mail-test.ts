/** Explicit offline setup. Only a disposable, loopback test database is accepted. */
import { readFile } from "node:fs/promises";
import { assertMailTestDatabase } from "../tests/helpers/mail-product";
assertMailTestDatabase(process.env.DATABASE_URL!);
assertMailTestDatabase(process.env.DATABASE_URL_UNPOOLED!);
const { database } = await import("../src/lib/db");
try {
  await database.query('CREATE SCHEMA IF NOT EXISTS webdock_admin; CREATE SCHEMA IF NOT EXISTS webdock_auth');
  const { snowflakeSchemaSQL } = await import("@webdock/snowflake");
  await database.query(snowflakeSchemaSQL("webdock_admin", 0));
  if (!(await database.query("SELECT to_regclass('webdock_admin.customers') AS table")).rows[0].table) {
    // Use the actual committed registry migrations, not a simplified fixture schema.
    for (const name of ['20261003_124635_initial', '20261003_133004_sso_subject', '20261004_081809_customer_profile']) {
      const source = await readFile(new URL(`../../admin/src/migrations/${name}.ts`, import.meta.url), 'utf8');
      const up = source.split('export async function down')[0];
      for (const match of up.matchAll(/db\.execute\(sql`([\s\S]*?)`\)/g)) {
        if (match[1].includes('${')) throw Error('Migration requires native interpolation');
        await database.query(match[1]);
      }
    }
  }
  const { auth } = await import('../src/lib/auth');
  const { getMigrations } = await import('better-auth/db/migration');
  await (await getMigrations(auth.options)).runMigrations();
  await database.query(snowflakeSchemaSQL('webdock_auth', 1));
  for (const { table_name } of (await database.query("SELECT table_name FROM information_schema.columns WHERE table_schema='webdock_auth' AND column_name='id' AND data_type='text'")).rows) {
    await database.query(`ALTER TABLE webdock_auth."${table_name.replaceAll('"', '""')}" ALTER COLUMN id SET DEFAULT webdock_auth.next_snowflake()`);
  }
  await database.query(`CREATE TABLE IF NOT EXISTS webdock_auth.app_binding(id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),client_id text UNIQUE NOT NULL REFERENCES webdock_auth."oauthClient"("clientId"),label text NOT NULL,organization_id text REFERENCES webdock_auth.organization(id),enabled boolean NOT NULL DEFAULT true);
  CREATE TABLE IF NOT EXISTS webdock_auth.project_grant(id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),user_id text NOT NULL REFERENCES webdock_auth."user"(id),binding_id text NOT NULL REFERENCES webdock_auth.app_binding(id),organization_id text NOT NULL REFERENCES webdock_auth.organization(id),role text NOT NULL CHECK(role IN ('admin','editor','reader')),enabled boolean NOT NULL DEFAULT true,UNIQUE(user_id,binding_id));`);
  for (const [module, name] of [
    ['tenant-schema','tenantSchemaSQL'], ['access-management','accessSchemaSQL'],
    ['platform','platformSchemaSQL'], ['tenant-mail','mailSchemaSQL'],
    ['mail-domains','senderDomainSchemaSQL'], ['mail-tracking','trackingSchemaSQL'],
    ['plans','plansSchemaSQL'], ['tenant-preview-schema','tenantPreviewSchemaSQL'],
  ]) {
    const exports = await import(`../src/lib/${module}.ts`);
    await database.query(exports[name]);
  }
  console.log('Disposable Mail test database initialized; no provider requests.');
} finally { await database.end(); }
