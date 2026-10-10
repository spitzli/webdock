import { database } from "../src/lib/db";
import { gitDeploymentSchemaSQL } from "../src/lib/hosting/git-deployment-schema";
const client = await database.connect();
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='60s'");
  await client.query(gitDeploymentSchemaSQL);
  await client.query("COMMIT");
  console.log("Git deployments schema ready; workers remain disabled.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await database.end();
}
