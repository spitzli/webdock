import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import {
  databaseRuntimeGrants,
  databaseSchemaSQL,
} from "../src/lib/hosting/database-schema";

const file = process.argv[2];
if (!file)
  throw Error(
    "Usage: migrate-hosting-databases.ts owner.env (optional AUTH_DB_ROLE)",
  );
const env = parseEnv(readFileSync(file, "utf8"));
const grants = databaseRuntimeGrants(
  env.AUTH_DB_ROLE || "webdock_auth_runtime",
);
const database = new Pool({
  connectionString: env.DATABASE_URL_UNPOOLED || env.DATABASE_URL,
  max: 1,
});
const client = await database.connect();
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='60s'");
  await client.query(databaseSchemaSQL);
  await client.query(grants);
  await client.query("COMMIT");
  console.log(
    "Managed PostgreSQL schema and scoped runtime grants migrated; no resource or offer activated.",
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await database.end();
}
