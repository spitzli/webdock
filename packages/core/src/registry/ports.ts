import type { Pool } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
export type RegistryIdentity = { subject: string; sessionID: string };
export type RegistryPool = Pick<
  Pool,
  "query" | "connect" | "idleCount" | "totalCount"
>;
/** The host owns connections, signed session scope and product installation state. */
export interface RegistryDependencies {
  database: NodePgDatabase;
  pool: RegistryPool;
  withSessionScope<T>(
    identity: RegistryIdentity,
    run: () => Promise<T>,
  ): Promise<T>;
  requireProduct(product: "cms", intent: "access" | "provision"): void;
  close(): Promise<void>;
}
