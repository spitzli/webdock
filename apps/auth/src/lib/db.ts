import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
export const database = new Pool({
  connectionString:
    process.env.AUTH_MIGRATING === "true"
      ? process.env.DATABASE_URL_UNPOOLED
      : process.env.DATABASE_URL,
  max: 4,
  ...(process.env.DATABASE_URL &&
  ["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL).hostname,
  )
    ? { options: "-c search_path=webdock_auth,pg_catalog" }
    : {}),
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 5000,
});
// Let idle sockets close before Fluid Compute suspends this function instance.
attachDatabasePool(database);
