import { Pool } from "pg";
// Independent autocommit allocation prevents ID reuse when the business transaction rolls back.
// ponytail: one allocator row serializes ID allocation; assign distinct node IDs if multi-region write volume requires it.
let allocator: Pool | undefined;
export async function nextSnowflake(): Promise<string> {
  allocator ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
  });
  const result = await allocator.query<{ id: string }>(
    "SELECT webdock_admin.next_snowflake() AS id",
  );
  return result.rows[0].id;
}
export async function closeSnowflakePool() {
  await allocator?.end();
  allocator = undefined;
}
