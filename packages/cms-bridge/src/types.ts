/** Transfer framing stays within the ordinary plugin HTTP message budget. */
export const CHUNK_BYTES = 16 * 1024;
export const JSON_BYTES = 1024 * 1024;
export const MEDIA_BYTES = 10 * 1024 * 1024;
export const METADATA_BYTES = 64 * 1024;
export type BridgeRole = "reader" | "editor" | "admin" | "operator";
export type BridgeScope = {
  instance: string;
  project: string;
  subject: string;
  role: BridgeRole;
  grantEpoch: string;
};
export type SerializedRequest = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  contentType?: string;
  bodyBase64?: string;
};
export type SerializedResponse = {
  status: number;
  contentType: string;
  bodyBase64: string;
};
export type TransferResult = { transfer: string; size: number; sha256: string };
export type BridgeEnvelope =
  | { op: "begin"; size: number; sha256: string; kind: "json" | "media" }
  | { op: "append"; transfer: string; offset: number; data: string }
  | { op: "commit"; transfer: string };
/** GET ?request=<base64url UTF8 SerializedRequest> executes only a bodyless GET.
 * GET ?transfer=<id>&offset=<byte offset> reads a serialized response chunk.
 * POST begin -> {transfer}, append -> {offset}, commit -> TransferResult.
 * GET request -> TransferResult. GET transfer -> {data,offset,done}.
 * Errors are {error:string}; an interrupted execution returns 409 reconciliation_required. */
export type BridgeHTTP = (request: {
  method: "GET" | "POST";
  path: string;
  body?: BridgeEnvelope;
}) => Promise<{ status: number; body: unknown }>;
