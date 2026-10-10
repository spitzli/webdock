import { database } from "../src/lib/db";
import { databaseSchemaSQL } from "../src/lib/databases/schema";

const client = await database.connect();
try {
  await client.query("BEGIN");
  await client.query(databaseSchemaSQL);
  await client.query("COMMIT");
  console.log("Database browser schema ready. No runtime or database was provisioned.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally { client.release(); await database.end(); }
