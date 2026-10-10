import { database } from "../src/lib/db";
import { migrateHosting } from "../src/lib/hosting/schema";
import { mcpResource } from "../src/lib/mcp";
try {
  await database.query("BEGIN");
  await migrateHosting(database, mcpResource);
  await database.query("COMMIT");
  console.log("Hosting foundation schema ready. No cluster was provisioned.");
} catch (error) {
  await database.query("ROLLBACK");
  throw error;
} finally {
  await database.end();
}
