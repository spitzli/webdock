// Offline operator command: never include the owner connection in the deployed app.
import fs from "node:fs";
import crypto from "node:crypto";
import { parseEnv } from "node:util";
import { Pool } from "pg";
const sourceFile = process.argv[2];
if (!sourceFile)
  throw Error("Usage: node scripts/provision.mjs /path/to/owner.env");
const source = parseEnv(fs.readFileSync(sourceFile, "utf8"));
const file = ".env.instance";
if (fs.existsSync(file))
  throw Error("Instance credentials already exist; refusing to replace them.");
const owner = new Pool({
  connectionString: source.DATABASE_URL_UNPOOLED,
  max: 1,
});
try {
  if (
    (
      await owner.query(
        "SELECT 1 FROM pg_roles WHERE rolname='webdock_admin_runtime'",
      )
    ).rowCount
  )
    throw Error(
      "Role already exists; recover existing credentials instead of rotating them.",
    );
  const password = crypto.randomBytes(40).toString("base64url");
  await owner.query("BEGIN");
  try {
    await owner.query(
      `CREATE ROLE webdock_admin_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password}'`,
    );
    await owner.query("GRANT webdock_admin_runtime TO CURRENT_USER");
    await owner.query(
      "CREATE SCHEMA webdock_admin AUTHORIZATION webdock_admin_runtime",
    );
    await owner.query("REVOKE ALL ON SCHEMA webdock_admin FROM PUBLIC");
    const name = (
      await owner.query("SELECT current_database() AS name")
    ).rows[0].name.replaceAll('"', '""');
    await owner.query(
      `ALTER ROLE webdock_admin_runtime IN DATABASE "${name}" SET search_path TO webdock_admin,pg_catalog`,
    );
    await owner.query("COMMIT");
  } catch (error) {
    await owner.query("ROLLBACK");
    throw error;
  }
  const pooled = new URL(source.DATABASE_URL),
    direct = new URL(source.DATABASE_URL_UNPOOLED);
  for (const url of [pooled, direct]) {
    url.username = "webdock_admin_runtime";
    url.password = password;
    url.searchParams.set("sslmode", "verify-full");
  }
  const env = {
    DATABASE_URL: pooled.toString(),
    DATABASE_URL_UNPOOLED: direct.toString(),
    PAYLOAD_SECRET: crypto.randomBytes(48).toString("base64url"),
    OPERATOR_EMAIL: "dominik@spitzli.dev",
    NEXT_PUBLIC_SERVER_URL: "https://admin.webdock.dev",
  };
  for (const key of [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
  ])
    env[key] = source[key];
  fs.writeFileSync(
    file,
    Object.entries(env)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join("\n") + "\n",
    { mode: 0o600, flag: "wx" },
  );
  const app = new Pool({ connectionString: env.DATABASE_URL_UNPOOLED, max: 1 });
  try {
    const roles = (
      await app.query(
        "SELECT nspname,has_schema_privilege(current_user,oid,'USAGE') AS allowed FROM pg_namespace WHERE nspname IN ('public','webdock','spitzli','stall','webdock_admin')",
      )
    ).rows;
    if (roles.some((row) => row.allowed !== (row.nspname === "webdock_admin")))
      throw Error("Schema isolation check failed");
    console.log(
      "Management schema/role provisioned and cross-schema access denied. Credentials saved privately.",
    );
  } finally {
    await app.end();
  }
} finally {
  await owner.end();
}
