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
  collections?: Record<string, RegistryCollectionExtension>;
  beforeArchive?: (
    tx: RegistryTransaction,
    collection: string,
    key: string,
  ) => Promise<void>;
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
/** Trusted host contributions execute inside core's operator transaction. */
export interface RegistryCollectionExtension {
  table: import("drizzle-orm/pg-core").PgTable & {
    id: import("drizzle-orm/pg-core").AnyPgColumn;
    createdAt: import("drizzle-orm/pg-core").AnyPgColumn;
    updatedAt: import("drizzle-orm/pg-core").AnyPgColumn;
  };
  sources: string[];
  relation?: [field: string, collection: string];
  searchField: string;
  statuses: string[];
  filters?: Record<string, string>;
  prepareWrite(
    key: string | null,
    input: unknown,
    options: unknown,
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
  }) => Promise<Record<string, unknown>>;
}
