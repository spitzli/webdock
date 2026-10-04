import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { tenantSchemaSQL, tenantProfileGrants } from "../src/lib/tenant-schema";

// Explicit legacy mappings avoid matching unrelated organizations by mutable names.
const ownerFile = process.argv[2];
const mappingsFile = process.argv[3];
if (!ownerFile || !mappingsFile) throw Error("Usage: migrate-tenants.ts owner.env existing-mappings.json");
const env = parseEnv(readFileSync(ownerFile, "utf8"));
const mappings: Record<string, string> = JSON.parse(readFileSync(mappingsFile, "utf8"));
if (!mappings || Array.isArray(mappings) || typeof mappings !== "object" ||
    Object.entries(mappings).some(([customer, org]) => !/^[1-9][0-9]{0,18}$/.test(customer) || typeof org !== "string" || !/^[1-9][0-9]{0,18}$/.test(org)))
  throw Error("Use a JSON object of customer IDs to organization IDs.");
const pool = new Pool({ connectionString: env.DATABASE_URL_UNPOOLED || env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("LOCK TABLE webdock_admin.customers IN SHARE ROW EXCLUSIVE MODE");
  await client.query(tenantSchemaSQL);
  for (const [customer, org] of Object.entries(mappings)) {
    const existing = (await client.query("SELECT organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$1", [customer])).rows[0];
    if (existing && existing.organization_id !== org) throw Error("Existing customer tenant differs from requested mapping.");
    await client.query("INSERT INTO webdock_auth.tenant_customer(customer_id,organization_id) VALUES($1,$2) ON CONFLICT(customer_id) DO NOTHING", [customer, org]);
  }
  const unresolved = (await client.query(`SELECT c.id FROM webdock_admin.customers c
    JOIN webdock_auth.organization o ON lower(o.name)=lower(c.name)
    WHERE NOT EXISTS(SELECT 1 FROM webdock_auth.tenant_customer t WHERE t.customer_id=c.id)`)).rows;
  if (unresolved.length) throw Error("Existing organizations may belong to unmapped customers. Supply explicit mappings before migration.");
  // Fires the trigger for unmapped historical customers too; a rerun reuses the same organization.
  await client.query("UPDATE webdock_admin.customers SET name=name");
  await client.query(tenantProfileGrants("webdock_auth_runtime"));
  const count = (await client.query("SELECT count(*)::int AS count FROM webdock_auth.tenant_customer")).rows[0].count;
  await client.query("COMMIT");
  console.log(`Tenant mapping ready for ${count} customers; public profile permissions granted.`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
