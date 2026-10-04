import { Pool } from "pg";
import { vercelSchemaSQL } from "../src/lib/vercel-store";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(vercelSchemaSQL);
  console.log("Vercel connection and project-link tables ready.");
} finally {
  await pool.end();
}
