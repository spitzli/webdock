import { Pool, type PoolConfig } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { ScopedPool, currentDatabaseScope, verifiedPostgresConfig } from "@webdock/database-runtime";

function configuration(url: string | undefined): PoolConfig {
  const local = url && ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname);
  return {
    ...(url && !local ? verifiedPostgresConfig(url, process.env.DATABASE_CA_CERT || undefined) : {connectionString:url}),
    max:4,
    ...(local ? {options:"-c search_path=webdock_auth,pg_catalog"}:{}),
    connectionTimeoutMillis:10000,
    idleTimeoutMillis:5000,
  };
}
const migrating = process.env.AUTH_MIGRATING === "true";
const url = migrating ? process.env.DATABASE_URL_UNPOOLED : process.env.DATABASE_URL;
const secret = migrating ? undefined : process.env.DATABASE_RLS_SECRET;
if (secret && (!process.env.AUTH_DATABASE_URL || !process.env.DATABASE_WORKER_URL))
  throw Error("RLS requires separate authentication and worker credentials");
const business = new ScopedPool(configuration(url), {secret,audience:"webdock_auth_runtime"});
export const authDatabase = secret ? new Pool(configuration(process.env.AUTH_DATABASE_URL)) : business;
export const workerDatabase = secret ? new ScopedPool(configuration(process.env.DATABASE_WORKER_URL), {secret,audience:"webdock_worker_runtime"}) : business;
// Scope selects a credential, never an implicit privilege upgrade for missing identity.
export const database = secret ? new Proxy(business, {
  get(target, key, receiver) {
    if (key === "query" || key === "connect") return (...args: unknown[]) => {
      const pool = currentDatabaseScope()?.kind === "system" ? workerDatabase : business;
      return Reflect.apply(Reflect.get(pool,key),pool,args);
    };
    const value = Reflect.get(target,key,receiver);
    return typeof value === "function" ? value.bind(target) : value;
  },
}) : business;
for (const pool of new Set([business,authDatabase,workerDatabase])) attachDatabasePool(pool);
