import { getMigrations } from "better-auth/db/migration";
import { snowflakeSchemaSQL } from "@webdock/snowflake";
import { auth } from "../src/lib/auth";
import { database } from "../src/lib/db";
try {
  const migrations = await getMigrations(auth.options);
  await migrations.runMigrations();
  await database.query(snowflakeSchemaSQL("webdock_auth", 1));
  const tables = (
    await database.query(
      "SELECT table_name FROM information_schema.columns WHERE table_schema='webdock_auth' AND column_name='id' AND data_type='text'",
    )
  ).rows;
  for (const { table_name } of tables)
    await database.query(
      `ALTER TABLE webdock_auth."${table_name.replaceAll('"', '""')}" ALTER COLUMN id SET DEFAULT webdock_auth.next_snowflake()`,
    );
  await database.query(`CREATE TABLE IF NOT EXISTS webdock_auth.app_binding(id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),client_id text UNIQUE NOT NULL REFERENCES webdock_auth."oauthClient"("clientId"),label text NOT NULL,organization_id text REFERENCES webdock_auth.organization(id),enabled boolean NOT NULL DEFAULT true);
 CREATE TABLE IF NOT EXISTS webdock_auth.project_grant(id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),user_id text NOT NULL REFERENCES webdock_auth."user"(id),binding_id text NOT NULL REFERENCES webdock_auth.app_binding(id),organization_id text NOT NULL REFERENCES webdock_auth.organization(id),role text NOT NULL CHECK(role IN ('admin','editor','reader')),enabled boolean NOT NULL DEFAULT true,UNIQUE(user_id,binding_id));`);
  console.log(
    "Auth tables, Snowflake node 1 and per-client authorization tables ready.",
  );
} finally {
  await database.end();
}
