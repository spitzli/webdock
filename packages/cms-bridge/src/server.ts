import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { authenticateBridge, BridgeError, projectBridgeUser } from "./auth.ts";
import type { Payload } from "payload";
import {
  CHUNK_BYTES,
  JSON_BYTES,
  MEDIA_BYTES,
  METADATA_BYTES,
  type BridgeEnvelope,
  type BridgeScope,
  type SerializedRequest,
  type TransferResult,
} from "./types.ts";
const TTL = 10 * 60_000;
// Base64 adds one third; the underlying HTTP request is separately bounded below.
const MAX_WIRE =
  Math.ceil(((MEDIA_BYTES + METADATA_BYTES) * 4) / 3) + METADATA_BYTES;
const MAX_SLOTS = 16,
  MAX_RECEIPTS = 128,
  MAX_RESERVED = 256 * 1024 * 1024;
type Entry = {
  scope: BridgeScope;
  expires: number;
  size: number;
  sha256: string;
  kind: "json" | "media";
  offset: number;
  state: "uploading" | "executing" | "complete";
  disposable?: boolean;
  result?: TransferResult;
};
const hash = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
const same = (a: BridgeScope, b: BridgeScope) =>
  a.instance === b.instance && a.project === b.project && a.subject === b.subject && a.role === b.role && a.grantEpoch === b.grantEpoch;
function decode(value: unknown, limit: number) {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(limit / 3) * 4 ||
    value.length % 4 !== 0 ||
    /[^A-Za-z0-9+/=]/.test(value)
  )
    throw new BridgeError("Invalid base64 chunk.");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > limit) throw new BridgeError("Transfer too large.", 413);
  // Canonical re-encoding validates padding and trailing bits without recursive regex.
  if (bytes.toString("base64") !== value)
    throw new BridgeError("Invalid base64 chunk.");
  return bytes;
}
function httpRequest(
  bytes: Buffer,
  origin: string,
  readOnly = false,
  kind: "json" | "media" = "json",
) {
  let data: SerializedRequest;
  try {
    data = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new BridgeError("Invalid serialized request.");
  }
  if (
    !data ||
    !["GET", "POST", "DELETE"].includes(data.method) ||
    typeof data.path !== "string" ||
    data.path.length > 1500 ||
    !/^\/api\/cms(?:\?[^#\\]*)?$/.test(data.path) ||
    (readOnly && data.method !== "GET")
  )
    throw new BridgeError("Invalid CMS request.");
  if (
    Object.keys(data).some(
      (key) => !["method", "path", "contentType", "bodyBase64"].includes(key),
    )
  )
    throw new BridgeError("Unexpected request field.");
  const url = new URL(data.path, origin);
  if (url.origin !== new URL(origin).origin)
    throw new BridgeError("Invalid CMS origin.");
  const body =
    data.bodyBase64 === undefined
      ? undefined
      : decode(
          data.bodyBase64,
          kind === "media" ? MEDIA_BYTES + METADATA_BYTES : JSON_BYTES,
        );
  if (
    data.method === "GET" &&
    (body !== undefined || data.contentType !== undefined)
  )
    throw new BridgeError("GET cannot carry a body.");
  if (
    data.method !== "GET" &&
    (!body ||
      typeof data.contentType !== "string" ||
      data.contentType.length > 200 ||
      !(kind === "media"
        ? /^multipart\/form-data; boundary=[\w'()+,./:=?-]{1,100}$/.test(
            data.contentType,
          )
        : data.contentType === "application/json"))
  )
    throw new BridgeError("Invalid CMS content type.");
  return new Request(url, {
    method: data.method,
    headers: {
      origin: new URL(origin).origin,
      ...(data.contentType ? { "content-type": data.contentType } : {}),
    },
    ...(body ? { body } : {}),
  });
}
async function boundedResponse(response: Response) {
  const contentType =
    response.headers.get("content-type") ?? "application/octet-stream";
  const limit = contentType.startsWith("image/") ? MEDIA_BYTES : JSON_BYTES;
  const reader = response.body?.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.length;
        if (size > limit) {
          await reader.cancel();
          throw new BridgeError("CMS response too large.", 413);
        }
        chunks.push(item.value);
      }
    } finally {
      reader.releaseLock();
    }
  return Buffer.from(
    JSON.stringify({
      status: response.status,
      contentType,
      bodyBase64: Buffer.concat(chunks).toString("base64"),
    }),
  );
}
export function validateBridgeBegin(scope: BridgeScope, input: Extract<BridgeEnvelope, {op: "begin"}>) {
      if (scope.role === "reader") throw new BridgeError("Read only.", 403);
      if (
        !Number.isSafeInteger(input.size) ||
        input.size < 1 ||
        input.size >
          (input.kind === "json"
            ? Math.ceil((JSON_BYTES * 4) / 3) + METADATA_BYTES
            : MAX_WIRE) ||
        !["json", "media"].includes(input.kind) ||
        !/^\w{64}$/.test(input.sha256) ||
        !/^[a-f0-9]+$/.test(input.sha256)
      )
        throw new BridgeError("Invalid transfer bounds.", 413);
}
/** Single replica, retained volume; the execution marker survives a process restart. */
export class BridgeTransfers {
  private queue: Promise<unknown> = Promise.resolve();
  private active = new Set<string>();
  constructor(
    private directory: string,
    private now = () => Date.now(),
  ) {}
  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn);
    this.queue = next.catch(() => {});
    return next;
  }
  private location(id: string, file: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new BridgeError("Invalid transfer.");
    return path.join(this.directory, id, file);
  }
  private async durable(file: string, bytes: Buffer | string) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
    const dir = await open(path.dirname(file), "r");
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  }
  private async save(id: string, entry: Entry) {
    await this.durable(this.location(id, "entry.json"), JSON.stringify(entry));
  }
  private async load(scope: BridgeScope, id: string): Promise<Entry> {
    let entry: Entry;
    try {
      entry = JSON.parse(
        await readFile(this.location(id, "entry.json"), "utf8"),
      );
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new BridgeError("Unknown transfer.", 404);
    }
    if (entry.expires <= this.now() || !same(scope, entry.scope))
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
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let slots = 0,
      receipts = 0,
      reserved = 0;
    for (const id of await readdir(this.directory)) {
      if (!/^[a-f0-9-]{36}$/.test(id)) continue;
      const location = this.location(id, "entry.json");
      let entry: Entry;
      try {
        entry = JSON.parse(await readFile(location, "utf8"));
      } catch {
        throw new BridgeError("Transfer storage requires reconciliation.", 503);
      }
      if (entry.expires <= this.now() && !this.active.has(id)) {
        await rm(path.join(this.directory, id), {
          recursive: true,
          force: true,
        });
        continue;
      }
      if (entry.state === "complete") {
        receipts++;
        reserved += entry.result?.size ?? MAX_WIRE;
      } else {
        slots++;
        reserved += entry.size + MAX_WIRE;
      }
    }
    if (
      slots >= MAX_SLOTS ||
      receipts + slots >= MAX_RECEIPTS ||
      reserved + size + MAX_WIRE > MAX_RESERVED
    )
      throw new BridgeError("Transfer capacity reached.", 429);
    const id = randomUUID();
    await mkdir(path.join(this.directory, id), { mode: 0o700 });
    await this.save(id, {
      scope,
      expires: this.now() + TTL,
      size,
      sha256,
      kind,
      offset: 0,
      state,
    });
    return id;
  }
  async begin(
    scope: BridgeScope,
    input: Extract<BridgeEnvelope, { op: "begin" }>,
  ) {
    return this.exclusive(async () => {
      validateBridgeBegin(scope, input);
      return {
        transfer: await this.allocate(
          scope,
          input.size,
          input.sha256,
          input.kind,
        ),
      };
    });
  }
  async append(
    scope: BridgeScope,
    input: Extract<BridgeEnvelope, { op: "append" }>,
  ) {
    return this.exclusive(async () => {
      const entry = await this.load(scope, input.transfer);
      if (
        entry.state !== "uploading" ||
        !Number.isSafeInteger(input.offset) ||
        input.offset < 0
      )
        throw new BridgeError("Transfer is not writable.", 409);
      const bytes = decode(input.data, CHUNK_BYTES);
      if (!bytes.length || input.offset + bytes.length > entry.size)
        throw new BridgeError("Chunk exceeds declared size.", 413);
      const file = this.location(input.transfer, "request");
      if (input.offset < entry.offset) {
        const existing = await open(file, "r");
        try {
          const previous = Buffer.alloc(bytes.length);
          await existing.read(previous, 0, bytes.length, input.offset);
          if (
            input.offset + bytes.length > entry.offset ||
            !previous.equals(bytes)
          )
            throw new BridgeError("Changed chunk.", 409);
        } finally {
          await existing.close();
        }
        return { offset: entry.offset };
      }
      if (input.offset !== entry.offset)
        throw new BridgeError("Incomplete transfer.", 409);
      const handle = await open(file, entry.offset ? "r+" : "w", 0o600);
      try {
        await handle.truncate(entry.offset);
        await handle.write(bytes, 0, bytes.length, entry.offset);
        await handle.sync();
      } finally {
        await handle.close();
      }
      entry.offset += bytes.length;
      await this.save(input.transfer, entry);
      return { offset: entry.offset };
    });
  }
  async commit(
    scope: BridgeScope,
    id: string,
    origin: string,
    execute: (request: Request) => Promise<Response>,
  ) {
    const prepared = await this.exclusive(async () => {
      const entry = await this.load(scope, id);
      if (entry.state === "complete") return { entry, request: null };
      if (entry.state === "executing")
        throw new BridgeError("reconciliation_required", 409);
      if (entry.offset !== entry.size)
        throw new BridgeError("Incomplete transfer.", 409);
      const bytes = await readFile(this.location(id, "request"));
      if (hash(bytes) !== entry.sha256)
        throw new BridgeError("Incorrect transfer digest.");
      const request = httpRequest(bytes, origin, false, entry.kind);
      if (request.method === "GET")
        throw new BridgeError("Use the read endpoint.");
      if (scope.role === "reader") throw new BridgeError("Read only.", 403);
      entry.state = "executing";
      await this.save(id, entry);
      this.active.add(id);
      return { entry, request };
    });
    if (!prepared.request) return prepared.entry.result!;
    try {
      const result = await boundedResponse(await execute(prepared.request));
      await this.durable(this.location(id, "response"), result);
      await rm(this.location(id, "request"));
      prepared.entry.state = "complete";
      prepared.entry.result = {
        transfer: id,
        size: result.length,
        sha256: hash(result),
      };
      await this.save(id, prepared.entry);
      return prepared.entry.result;
    } finally {
      this.active.delete(id);
    }
  }
  async get(
    scope: BridgeScope,
    descriptor: string,
    origin: string,
    execute: (request: Request) => Promise<Response>,
  ) {
    if (!/^[A-Za-z0-9_-]{1,2400}$/.test(descriptor))
      throw new BridgeError("Invalid read request.");
    const request = httpRequest(
      Buffer.from(descriptor, "base64url"),
      origin,
      true,
    );
    const id = await this.exclusive(async () => {
      const transfer = await this.allocate(scope, 0, "", "json", "executing");
      this.active.add(transfer);
      return transfer;
    });
    try {
      const bytes = await boundedResponse(await execute(request));
      await this.durable(this.location(id, "response"), bytes);
      const entry = await this.load(scope, id);
      entry.state = "complete";
      entry.disposable = true;
      entry.result = { transfer: id, size: bytes.length, sha256: hash(bytes) };
      await this.save(id, entry);
      return entry.result;
    } catch (error) {
      await rm(path.join(this.directory, id), { recursive: true, force: true });
      throw error;
    } finally {
      this.active.delete(id);
    }
  }

  async read(scope: BridgeScope, id: string, offset: number) {
    const entry = await this.load(scope, id);
    if (
      entry.state !== "complete" ||
      !entry.result ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset >= entry.result.size
    )
      throw new BridgeError("Invalid response offset.");
    const file = await open(this.location(id, "response"), "r");
    try {
      const bytes = Buffer.alloc(
        Math.min(CHUNK_BYTES, entry.result.size - offset),
      );
      const { bytesRead } = await file.read(bytes, 0, bytes.length, offset);
      if (bytesRead !== bytes.length)
        throw new BridgeError("Incomplete response.", 503);
      const done = offset + bytesRead === entry.result.size;
      const result = {
        data: bytes.toString("base64"),
        offset: offset + bytesRead,
        done,
      };
      if (done && entry.disposable)
        await rm(path.join(this.directory, id), {
          recursive: true,
          force: true,
        });
      return result;
    } finally {
      await file.close();
    }
  }
}

export type CMSBridgeConfiguration = {
  secret: string;
  instance: string;
  project: string;
  origin: string;
  transferDirectory?: string;
};
export type CMSBridgeTransferStore = Pick<BridgeTransfers, "begin" | "append" | "commit" | "get" | "read">;
export type CMSBridgeHandlerOptions = {
  createTransfers?: (config: CMSBridgeConfiguration) => CMSBridgeTransferStore;
  /** Return null until an existing site explicitly opts in. Evaluated on every frame. */
  getConfig: () =>
    CMSBridgeConfiguration | null | Promise<CMSBridgeConfiguration | null>;
  getPayload: () => Promise<Payload>;
  handleCMS: (
    request: Request,
    user: Awaited<ReturnType<typeof projectBridgeUser>>,
  ) => Promise<Response>;
};
/** Reusable opt-in adapter for independent existing website CMS instances. */
export function createCMSBridgeHandler(options: CMSBridgeHandlerOptions) {
  let directory: string | undefined;
  let transfers: CMSBridgeTransferStore | undefined;
  return async function handle(request: Request) {
    try {
      const config = await options.getConfig();
      if (!config) throw new BridgeError("CMS bridge is not enabled.", 503);
      if (!["GET", "POST"].includes(request.method))
        throw new BridgeError("Unsupported bridge method.", 405);
      if (!transfers || directory !== config.transferDirectory) {
        directory = config.transferDirectory;
        if (!options.createTransfers && !directory) throw new BridgeError("Durable transfer storage is not configured.", 503);
        transfers = options.createTransfers ? options.createTransfers(config) : new BridgeTransfers(directory!);
      }
      const scope = authenticateBridge(request.headers, {
        secret: config.secret,
        instance: config.instance,
        project: config.project,
      });
      // Re-evaluate the local disabled flag and role ceiling for every chunk and commit.
      const user = await projectBridgeUser(await options.getPayload(), scope);
      scope.role = user.role;
      const execute = (inner: Request) => options.handleCMS(inner, user);
      let result;
      if (request.method === "GET") {
        const url = new URL(request.url);
        if (url.searchParams.has("request") && url.searchParams.size === 1)
          result = await transfers.get(
            scope,
            url.searchParams.get("request")!,
            config.origin,
            execute,
          );
        else if (
          url.searchParams.has("transfer") &&
          url.searchParams.has("offset") &&
          url.searchParams.size === 2 &&
          /^\d+$/.test(url.searchParams.get("offset")!)
        )
          result = await transfers.read(
            scope,
            url.searchParams.get("transfer")!,
            Number(url.searchParams.get("offset")),
          );
        else throw new BridgeError("Invalid bridge read.");
      } else {
        if (
          !request.headers.get("content-type")?.startsWith("application/json")
        )
          throw new BridgeError("Use JSON.", 415);
        const reader = request.body?.getReader();
        let size = 0;
        const chunks: Uint8Array[] = [];
        if (reader)
          try {
            while (true) {
              const item = await reader.read();
              if (item.done) break;
              size += item.value.length;
              if (size > 32 * 1024) {
                await reader.cancel();
                throw new BridgeError("Bridge frame too large.", 413);
              }
              chunks.push(item.value);
            }
          } finally {
            reader.releaseLock();
          }
        let body: BridgeEnvelope;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          throw new BridgeError("Invalid bridge JSON.");
        }
        if (body?.op === "begin") result = await transfers.begin(scope, body);
        else if (body?.op === "append")
          result = await transfers.append(scope, body);
        else if (body?.op === "commit")
          result = await transfers.commit(
            scope,
            body.transfer,
            config.origin,
            execute,
          );
        else throw new BridgeError("Unknown bridge operation.");
      }
      return Response.json(result, {
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof BridgeError
              ? error.message
              : "CMS bridge unavailable.",
        },
        {
          status: error instanceof BridgeError ? error.status : 503,
          headers: { "cache-control": "no-store" },
        },
      );
    }
  };
}

export {
 TTL as TRANSFER_TTL_MS,
 MAX_WIRE as MAX_SERIALIZED_BYTES,
 MAX_SLOTS as MAX_ACTIVE_TRANSFERS,
 MAX_RECEIPTS,
 MAX_RESERVED as MAX_RESERVED_BYTES,
 hash as bridgeRequestDigest,
 same as sameBridgeScope,
 decode as decodeBridgeBase64,
 httpRequest as createBridgeHTTPRequest,
 boundedResponse as serializeBridgeResponse,
};
