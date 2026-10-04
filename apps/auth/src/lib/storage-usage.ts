import { randomUUID } from "node:crypto";
import { list, type ListBlobResult, type ListCommandOptions } from "@vercel/blob";
import type { PoolClient } from "pg";
import { auth } from "./auth";
import { database } from "./db";
import { getTenant } from "./tenants";
import { encryptMailSecret, decryptMailSecret } from "./platform";

export class StorageUsageError extends Error {}
export const storageUsageSchemaSQL = `
CREATE TABLE IF NOT EXISTS webdock_auth.tenant_storage (
 id text PRIMARY KEY, customer_id text NOT NULL REFERENCES webdock_auth.tenant_customer(customer_id),
 label text NOT NULL, environment text NOT NULL CHECK(environment IN ('production','preview')),
 store_id text NOT NULL, prefix text NOT NULL, encrypted_token text NOT NULL,
 bytes bigint CHECK(bytes BETWEEN 0 AND 9007199254740991), objects integer CHECK(objects>=0),
 checked_at timestamptz, last_attempt_at timestamptz, error text, revision bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(store_id,prefix)
);
ALTER TABLE webdock_auth.tenant_storage ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;
CREATE INDEX IF NOT EXISTS tenant_storage_customer ON webdock_auth.tenant_storage(customer_id);`;
type Dependencies = { list?: (options: ListCommandOptions<"expanded">) => Promise<ListBlobResult> };
type Store = { id: string; label: string; environment: "production" | "preview"; prefix: string; storeID: string; bytes: number | null; objects: number | null; checkedAt: string | null; error: string | null };
const fail = (message: string): never => { throw new StorageUsageError(message); };
const measurementError = "Storage inventory is unavailable or incomplete. Previous values are stale; retry the measurement.";

export function normalizeStoragePrefix(value: string) {
 const raw = value.trim();
 if (raw.startsWith("/")) fail("Use a relative folder prefix, or leave it empty for the whole store.");
 const prefix = raw.replace(/\/+$/, "");
 if (prefix.length > 512 || /[\x00-\x20\x7f\\?#]/.test(prefix) || prefix.startsWith("/") || prefix.split("/").some(part => part === "." || part === ".." || (!part && prefix !== ""))) fail("Use a relative folder prefix, or leave it empty for the whole store.");
 return prefix ? `${prefix}/` : "";
}
function validateStoreToken(storeID: string, token: string) {
 // Blob SDK 2.3.1 extracts the store identifier from the fourth underscore segment.
 const match = /^vercel_blob_rw_([a-zA-Z0-9]+)_([a-zA-Z0-9]+)$/.exec(token);
 if (!/^store_[a-zA-Z0-9]+$/.test(storeID) || token.length > 512 || !match || `store_${match[1]}`.toLowerCase() !== storeID.toLowerCase()) fail("Provide a Blob store ID and its matching read/write token.");
 return match![1].toLowerCase();
}
/** Inventory metadata only. A complete bounded traversal is required before replacing a snapshot. */
export async function measureStorage(storeID: string, token: string, prefix: string, dependencies: Dependencies = {}) {
 prefix = normalizeStoragePrefix(prefix);
 const store = validateStoreToken(storeID, token);
 const controller = new AbortController();
 let timer: ReturnType<typeof setTimeout> | undefined;
 const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new StorageUsageError(measurementError)); }, 30_000); });
 try {
  return await Promise.race([timeout, (async () => {
   let bytes = 0, objects = 0, metadataBytes = 0, cursor: string | undefined;
   const cursors = new Set<string>(), paths = new Set<string>();
   for (let page = 0; page < 100; page++) {
    controller.signal.throwIfAborted();
    const result = await (dependencies.list || list)({ token, prefix, cursor, limit: 1000, mode: "expanded", abortSignal: controller.signal });
    controller.signal.throwIfAborted();
    if (!Array.isArray(result.blobs) || result.blobs.length > 1000 || typeof result.hasMore !== "boolean") fail(measurementError);
    metadataBytes += Buffer.byteLength(JSON.stringify(result));
    if (metadataBytes > 32 * 1024 * 1024) fail(measurementError);
    for (const blob of result.blobs) {
     const url = new URL(blob.url);
     if (typeof blob.pathname !== "string" || !blob.pathname.startsWith(prefix) || paths.has(blob.pathname) || !Number.isSafeInteger(blob.size) || blob.size < 0 || url.protocol !== "https:" || url.host !== `${store}.public.blob.vercel-storage.com`) fail(measurementError);
     paths.add(blob.pathname); bytes += blob.size; objects++;
     if (!Number.isSafeInteger(bytes)) fail(measurementError);
    }
    if (!result.hasMore) return { bytes, objects };
    if (!result.cursor || result.cursor.length > 4096 || cursors.has(result.cursor)) fail(measurementError);
    cursors.add(result.cursor!); cursor = result.cursor;
   }
   return fail(measurementError);
  })()]);
 } catch { return fail(measurementError); }
 finally { clearTimeout(timer); controller.abort(); }
}
export async function getTenantStorage(headers: Headers, customerID: string): Promise<{ stores: Store[]; productionBytes: number | null; previewBytes: number | null }> {
 await getTenant(headers, customerID);
 const rows = (await database.query("SELECT id,label,environment,prefix,store_id,bytes,objects,checked_at,error FROM webdock_auth.tenant_storage WHERE customer_id=$1 ORDER BY environment,label,id", [customerID])).rows;
 const stores: Store[] = rows.map(row => ({ id: row.id, label: row.label, environment: row.environment, prefix: row.prefix, storeID: row.store_id, bytes: row.bytes === null ? null : Number(row.bytes), objects: row.objects, checkedAt: row.checked_at ? new Date(row.checked_at).toISOString() : null, error: row.error }));
 const total = (environment: Store["environment"]) => {
  const subset = stores.filter(store => store.environment === environment);
  if (!subset.length || subset.some(store => store.bytes === null || store.error || !store.checkedAt)) return null;
  const sum = subset.reduce((sum, store) => sum + store.bytes!, 0);
  return Number.isSafeInteger(sum) ? sum : null;
 };
 return { stores, productionBytes: total("production"), previewBytes: total("preview") };
}
async function operator(headers: Headers, customerID: string) {
 const access = await getTenant(headers, customerID);
 if (!access.operator || access.tenant.status !== "active") fail("Active tenant and platform operator access are required.");
 const session = await auth.api.getSession({ headers });
 if (!session) fail("Sign in first.");
 return session!.user.id;
}
async function save(headers: Headers, customerID: string, action: string, work: (connection: PoolClient) => Promise<void>) {
 const actorID = await operator(headers, customerID);
 const connection = await database.connect();
 try {
  await connection.query("BEGIN");
  const actor = (await connection.query('SELECT id FROM webdock_auth."user" WHERE id=$1 AND role=\'operator\' AND NOT coalesce(banned,false) AND "emailVerified" AND "twoFactorEnabled" AND NOT "mustChangePassword" FOR SHARE', [actorID])).rows[0];
  const tenant = (await connection.query("SELECT id FROM webdock_admin.customers WHERE id=$1 AND status='active' FOR SHARE", [customerID])).rows[0];
  if (!actor || !tenant) fail("Active tenant and platform operator access are required.");
  await work(connection);
  await connection.query("INSERT INTO webdock_auth.access_event(actor_id,action,target_id,outcome) VALUES($1,$2,$3,'succeeded')", [actorID, `storage-${action}`, customerID]);
  await connection.query("COMMIT");
 } catch (error) { await connection.query("ROLLBACK"); throw error; }
 finally { connection.release(); }
}
export async function manageTenantStorage(headers: Headers, customerID: string, input: Record<string, string>, dependencies: Dependencies = {}): Promise<{ message: string }> {
 await operator(headers, customerID);
 if (!["add", "refresh", "remove"].includes(input.action)) fail("Unknown storage action.");
 try {
  if (input.action === "add") {
   const label = (input.label || "").trim(), prefix = normalizeStoragePrefix(input.prefix || "");
   const storeID = (input.storeID || "").trim().toLowerCase(), token = (input.token || "").trim();
   if (!label || label.length > 160 || /[\x00-\x1f\x7f]/.test(label) || !["production", "preview"].includes(input.environment)) fail("Provide a readable project label and production or preview environment.");
   validateStoreToken(storeID, token);
   const id = randomUUID(), encrypted = encryptMailSecret(token, `storage:${id}`);
   const measured = await measureStorage(storeID, token, prefix, dependencies);
   await save(headers, customerID, "add", async connection => {
    // Serialize store claims; disjoint legacy prefixes are permitted, overlapping ownership is not.
    await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`storage:${storeID}`]);
    const conflict = (await connection.query("SELECT id FROM webdock_auth.tenant_storage WHERE store_id=$1 AND (starts_with(prefix,$2) OR starts_with($2,prefix))", [storeID, prefix])).rows[0];
    if (conflict) fail("This store or overlapping folder is already mapped. Remove its existing mapping first.");
    await connection.query("INSERT INTO webdock_auth.tenant_storage(id,customer_id,label,environment,store_id,prefix,encrypted_token,bytes,objects,checked_at,last_attempt_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())", [id, customerID, label, input.environment, storeID, prefix, encrypted, measured.bytes, measured.objects]);
   });
  } else {
   const stored = (await database.query("SELECT * FROM webdock_auth.tenant_storage WHERE id=$1 AND customer_id=$2", [input.storageID || "", customerID])).rows[0];
   if (!stored) fail("Storage mapping not found.");
   if (input.action === "remove") {
    await save(headers, customerID, "remove", async connection => {
     const removed = await connection.query("DELETE FROM webdock_auth.tenant_storage WHERE id=$1 AND customer_id=$2 AND revision=$3", [stored.id, customerID, stored.revision]);
     if (!removed.rowCount) fail("Storage mapping changed. Refresh and retry.");
    });
   } else {
    let measured: { bytes: number; objects: number } | undefined;
    try { measured = await measureStorage(stored.store_id, decryptMailSecret<string>(stored.encrypted_token, `storage:${stored.id}`), stored.prefix, dependencies); } catch { /* Preserve last successful values and timestamp on failure. */ }
    await save(headers, customerID, "refresh", async connection => {
     const updated = await connection.query("UPDATE webdock_auth.tenant_storage SET bytes=CASE WHEN $4 THEN $5 ELSE bytes END,objects=CASE WHEN $4 THEN $6 ELSE objects END,checked_at=CASE WHEN $4 THEN now() ELSE checked_at END,error=$7,last_attempt_at=now(),revision=revision+1 WHERE id=$1 AND customer_id=$2 AND revision=$3", [stored.id, customerID, stored.revision, !!measured, measured?.bytes ?? null, measured?.objects ?? null, measured ? null : measurementError]);
     if (!updated.rowCount) fail("Storage mapping changed. Refresh and retry.");
    });
    if (!measured) fail(measurementError);
   }
  }
  return { message: input.action === "remove" ? "Local mapping removed. Stored files are unchanged." : "Storage mapping and complete inventory saved." };
 } catch (error) {
  if (error instanceof StorageUsageError) throw error;
  return fail("Storage operation failed. No credentials are shown; check the mapping and retry.");
 }
}

/** Trusted scheduled job only: callers must authenticate the scheduler before invoking this function. */
export async function refreshStorageBatch(dependencies: Dependencies = {}): Promise<{ attempted: number; succeeded: number; failed: number }> {
 // Reserve briefly, then release all row locks before inventory requests. The revision also
 // prevents an older manual/cron refresh from overwriting a newer reservation or measurement.
 const claimed = (await database.query(`WITH candidates AS (
  SELECT s.id FROM webdock_auth.tenant_storage s JOIN webdock_admin.customers c ON c.id=s.customer_id
  WHERE c.status='active' AND (s.last_attempt_at IS NULL OR s.last_attempt_at < now()-interval '24 hours')
  ORDER BY s.last_attempt_at ASC NULLS FIRST,s.id LIMIT 10 FOR UPDATE OF s SKIP LOCKED
 ) UPDATE webdock_auth.tenant_storage s SET last_attempt_at=now(),revision=s.revision+1
 FROM candidates WHERE s.id=candidates.id RETURNING s.*`)).rows;
 const result = { attempted: claimed.length, succeeded: 0, failed: 0 };
 let next = 0;
 async function worker() {
  while (next < claimed.length) {
   const stored = claimed[next++];
   let measured: { bytes: number; objects: number } | undefined;
   try { measured = await measureStorage(stored.store_id, decryptMailSecret<string>(stored.encrypted_token, `storage:${stored.id}`), stored.prefix, dependencies); } catch { /* Keep previous values and record a generic error. */ }
   const saved = await database.query(`UPDATE webdock_auth.tenant_storage s SET
    bytes=CASE WHEN $3 THEN $4 ELSE bytes END,objects=CASE WHEN $3 THEN $5 ELSE objects END,
    checked_at=CASE WHEN $3 THEN now() ELSE checked_at END,error=$6,revision=revision+1
    WHERE id=$1 AND revision=$2 AND EXISTS(SELECT 1 FROM webdock_admin.customers c WHERE c.id=s.customer_id AND c.status='active')`,
   [stored.id, stored.revision, !!measured, measured?.bytes ?? null, measured?.objects ?? null, measured ? null : measurementError]);
   if (measured && saved.rowCount) result.succeeded++; else result.failed++;
  }
 }
 await Promise.all([worker(), worker()]);
 return result;
}
