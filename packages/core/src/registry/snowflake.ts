import type { RegistryPool } from "./ports";
/** Keep decimal Snowflake values as strings across every boundary. */
export async function nextRegistryID(pool: RegistryPool): Promise<string> {
  return (
    await pool.query<{ id: string }>(
      "SELECT webdock_admin.next_snowflake() AS id",
    )
  ).rows[0].id;
}
