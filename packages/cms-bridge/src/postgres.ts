import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { BridgeError } from "./auth.ts";
import {
  TRANSFER_TTL_MS,
  MAX_SERIALIZED_BYTES,
  MAX_ACTIVE_TRANSFERS,
  MAX_RECEIPTS,
  MAX_RESERVED_BYTES,
  bridgeRequestDigest,
  decodeBridgeBase64,
  createBridgeHTTPRequest,
  serializeBridgeResponse,
  validateBridgeBegin,
  type CMSBridgeTransferStore,
} from "./server.ts";
import {
  CHUNK_BYTES,
  type BridgeEnvelope,
  type BridgeScope,
  type TransferResult,
} from "./types.ts";

type Entry = {
  id: string;
  size: number;
  sha256: string;
  kind: "json" | "media";
  offset: number;
  state: "uploading" | "executing" | "complete";
  expires: string;
  disposable: boolean;
  result: TransferResult | null;
};
/** PostgreSQL storage for serverless hosts. The caller owns the pool and runs migrations. */
export class PostgresBridgeTransfers implements CMSBridgeTransferStore {
  private table: string;
  private chunks: string;
  constructor(
    private pool: Pick<Pool, "connect">,
    schema = "webdock",
    private now = () => Date.now(),
  ) {
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema))
      throw new Error("Invalid bridge schema.");
    this.table = `"${schema}"."cms_bridge_transfers"`;
    this.chunks = `"${schema}"."cms_bridge_transfer_chunks"`;
  }
  private scope(scope: BridgeScope) {
    return [
      scope.instance,
      scope.project,
      scope.subject,
      scope.role,
      scope.grantEpoch,
    ];
  }
  private async transaction<T>(run: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  private async load(
    client: PoolClient,
    scope: BridgeScope,
    id: string,
  ): Promise<Entry> {
    if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id))
      throw new BridgeError("Invalid transfer.");
    const {
      rows: [entry],
    } = await client.query<Entry>(
      `SELECT id,size,sha256,kind,"offset",state,expires,disposable,result FROM ${this.table}
      WHERE instance=$1 AND project=$2 AND subject=$3 AND role=$4 AND grant_epoch=$5 AND id=$6 FOR UPDATE`,
      [...this.scope(scope), id],
    );
    if (!entry) throw new BridgeError("Transfer unavailable.", 403);
    if (Number(entry.expires) <= this.now())
      throw new BridgeError("Transfer unavailable.", 403);
    return entry;
  }
  private async allocate(
    scope: BridgeScope,
    size: number,
    sha256: string,
    kind: "json" | "media",
    state: Entry["state"] = "uploading",
  ) {
    return this.transaction(async (client) => {
      // All allocators for this instance share a transaction lock, including other processes.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [JSON.stringify([this.table, scope.instance, scope.project])],
      );
      await client.query(
        `DELETE FROM ${this.table} WHERE instance=$1 AND project=$2 AND expires<=$3`,
        [scope.instance, scope.project, this.now()],
      );
      const {
        rows: [usage],
      } = await client.query(
        `SELECT count(*) FILTER (WHERE state<>'complete') AS active,
        count(*) FILTER (WHERE state='complete') AS receipts,
        COALESCE(sum(CASE WHEN state='complete' THEN (result->>'size')::bigint ELSE size+$3 END),0) AS reserved
        FROM ${this.table} WHERE instance=$1 AND project=$2`,
        [scope.instance, scope.project, MAX_SERIALIZED_BYTES],
      );
      if (
        Number(usage.active) >= MAX_ACTIVE_TRANSFERS ||
        Number(usage.receipts) + Number(usage.active) >= MAX_RECEIPTS ||
        Number(usage.reserved) + size + MAX_SERIALIZED_BYTES >
          MAX_RESERVED_BYTES
      )
        throw new BridgeError("Transfer capacity reached.", 429);
      const id = randomUUID();
      await client.query(
        `INSERT INTO ${this.table}(id,instance,project,subject,role,grant_epoch,expires,size,sha256,kind,state)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          ...this.scope(scope),
          this.now() + TRANSFER_TTL_MS,
          size,
          sha256,
          kind,
          state,
        ],
      );
      return id;
    });
  }
  async begin(
    scope: BridgeScope,
    input: Extract<BridgeEnvelope, { op: "begin" }>,
  ) {
    validateBridgeBegin(scope, input);
    return {
      transfer: await this.allocate(
        scope,
        input.size,
        input.sha256,
        input.kind,
      ),
    };
  }
  async append(
    scope: BridgeScope,
    input: Extract<BridgeEnvelope, { op: "append" }>,
  ) {
    return this.transaction(async (client) => {
      const entry = await this.load(client, scope, input.transfer);
      if (
        entry.state !== "uploading" ||
        !Number.isSafeInteger(input.offset) ||
        input.offset < 0
      )
        throw new BridgeError("Transfer is not writable.", 409);
      const bytes = decodeBridgeBase64(input.data, CHUNK_BYTES);
      if (!bytes.length || input.offset + bytes.length > entry.size)
        throw new BridgeError("Chunk exceeds declared size.", 413);
      if (input.offset < entry.offset) {
        const { rows } = await client.query<{ data: Buffer; offset: number }>(
          `SELECT data,"offset" FROM ${this.chunks}
          WHERE transfer=$1 AND "offset"<$3 AND "offset"+octet_length(data)>$2 ORDER BY "offset"`,
          [entry.id, input.offset, input.offset + bytes.length],
        );
        const previous = Buffer.concat(
          rows.map((row) =>
            row.data.subarray(
              Math.max(0, input.offset - row.offset),
              Math.min(
                row.data.length,
                input.offset + bytes.length - row.offset,
              ),
            ),
          ),
        );
        if (
          input.offset + bytes.length > entry.offset ||
          !bytes.equals(previous)
        )
          throw new BridgeError("Changed chunk.", 409);
        return { offset: entry.offset };
      }
      if (input.offset !== entry.offset)
        throw new BridgeError("Incomplete transfer.", 409);
      // One row per full chunk also bounds PostgreSQL row/index overhead.
      if (bytes.length !== Math.min(CHUNK_BYTES, entry.size - entry.offset))
        throw new BridgeError("Incomplete chunk.");
      await client.query(
        `INSERT INTO ${this.chunks}(transfer,"offset",data) VALUES($1,$2,$3)`,
        [entry.id, input.offset, bytes],
      );
      await client.query(
        `UPDATE ${this.table} SET "offset"="offset"+$2 WHERE id=$1`,
        [entry.id, bytes.length],
      );
      return { offset: entry.offset + bytes.length };
    });
  }
  private async finish(
    scope: BridgeScope,
    id: string,
    bytes: Buffer,
    disposable = false,
  ) {
    return this.transaction(async (client) => {
      const entry = await this.load(client, scope, id);
      if (entry.state !== "executing")
        throw new BridgeError("reconciliation_required", 409);
      const result = {
        transfer: id,
        size: bytes.length,
        sha256: bridgeRequestDigest(bytes),
      };
      await client.query(
        `UPDATE ${this.table} SET state='complete',response=$2,result=$3,disposable=$4 WHERE id=$1`,
        [id, bytes, result, disposable],
      );
      await client.query(`DELETE FROM ${this.chunks} WHERE transfer=$1`, [id]);
      return result;
    });
  }
  async commit(
    scope: BridgeScope,
    id: string,
    origin: string,
    execute: (request: Request) => Promise<Response>,
  ) {
    const prepared = await this.transaction(async (client) => {
      const entry = await this.load(client, scope, id);
      if (entry.state === "complete")
        return { result: entry.result!, request: null };
      if (entry.state === "executing")
        throw new BridgeError("reconciliation_required", 409);
      if (entry.offset !== entry.size)
        throw new BridgeError("Incomplete transfer.", 409);
      const { rows } = await client.query<{ data: Buffer }>(
        `SELECT data FROM ${this.chunks} WHERE transfer=$1 ORDER BY "offset"`,
        [id],
      );
      const bytes = Buffer.concat(rows.map((row) => row.data));
      if (bridgeRequestDigest(bytes) !== entry.sha256)
        throw new BridgeError("Incorrect transfer digest.");
      const request = createBridgeHTTPRequest(bytes, origin, false, entry.kind);
      if (request.method === "GET")
        throw new BridgeError("Use the read endpoint.");
      if (scope.role === "reader") throw new BridgeError("Read only.", 403);
      await client.query(
        `UPDATE ${this.table} SET state='executing' WHERE id=$1`,
        [id],
      );
      return { result: null, request };
    });
    if (!prepared.request) return prepared.result!;
    // The marker is committed before calling Payload; any subsequent failure is ambiguous.
    return this.finish(
      scope,
      id,
      await serializeBridgeResponse(await execute(prepared.request)),
    );
  }
  async get(
    scope: BridgeScope,
    descriptor: string,
    origin: string,
    execute: (request: Request) => Promise<Response>,
  ) {
    if (!/^[A-Za-z0-9_-]{1,2400}$/.test(descriptor))
      throw new BridgeError("Invalid read request.");
    const request = createBridgeHTTPRequest(
      Buffer.from(descriptor, "base64url"),
      origin,
      true,
    );
    const id = await this.allocate(scope, 0, "", "json", "executing");
    try {
      return await this.finish(
        scope,
        id,
        await serializeBridgeResponse(await execute(request)),
        true,
      );
    } catch (error) {
      await this.transaction(async (client) => {
        await client.query(`DELETE FROM ${this.table} WHERE id=$1`, [id]);
      });
      throw error;
    }
  }
  async read(scope: BridgeScope, id: string, offset: number) {
    return this.transaction(async (client) => {
      const entry = await this.load(client, scope, id);
      if (
        entry.state !== "complete" ||
        !entry.result ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset >= entry.result.size
      )
        throw new BridgeError("Invalid response offset.");
      const length = Math.min(CHUNK_BYTES, entry.result.size - offset);
      const {
        rows: [{ bytes }],
      } = await client.query(
        `SELECT substring(response FROM $2 FOR $3) AS bytes FROM ${this.table} WHERE id=$1`,
        [id, offset + 1, length],
      );
      if (!bytes || bytes.length !== length)
        throw new BridgeError("Incomplete response.", 503);
      const done = offset + length === entry.result.size;
      if (done && entry.disposable)
        await client.query(`DELETE FROM ${this.table} WHERE id=$1`, [id]);
      return { data: bytes.toString("base64"), offset: offset + length, done };
    });
  }
}
