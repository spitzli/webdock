import type { Pool } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
type JSONValue =
  null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };
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
  cms?: RegistryCmsExtension;
  readCachedView?<T>(
    options: {
      kind: "registry";
      scope: Record<string, string>;
      query: JSONValue;
      ttlSeconds: number;
    },
    version: () => Promise<string | null>,
    load: () => Promise<T>,
  ): Promise<T>;
  close(): Promise<void>;
}

export type RegistryTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];
/** Legacy CMS collection compatibility; its runtime behavior belongs to the module. */
export interface RegistryCmsExtension {
  table: typeof import("@webdock/platform-db/schema/registry").cmsInstances;
  prepareWrite(
    key: string | null,
    input: unknown,
    confirmExisting: boolean,
  ): (context: {
    tx: RegistryTransaction;
    localID: string;
    id(tx: RegistryTransaction): Promise<string>;
    audit(
      tx: RegistryTransaction,
      actor: string,
      collection: string,
      before: Record<string, unknown> | undefined,
      after: Record<string, unknown>,
    ): Promise<void>;
  }) => Promise<
    typeof import("@webdock/platform-db/schema/registry").cmsInstances.$inferSelect
  >;
  beforeArchiveProject(tx: RegistryTransaction, key: string): Promise<void>;
}
