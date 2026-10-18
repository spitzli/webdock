import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
/** Narrow platform persistence handles; construction and signed RLS scope stay at composition. */
export type PlatformDatabaseRuntime = {
  orm: NodePgDatabase;
  workerOrm: NodePgDatabase;
  worker: Pick<Pool, "query" | "connect">;
};
export type PlatformTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];
