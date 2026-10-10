import "server-only";
import { headers } from "next/headers";
import { HostingError } from "@webdock/hosting-contracts";
import { databaseCommand, type DatabaseCommand } from "@webdock/database-contracts";
import { sso } from "./sso";
import { HostingSessionRequiredError } from "./hosting-page-access";

export async function databaseCall<T>(command: DatabaseCommand): Promise<T> {
  const session = sso && await sso.getDelegatedSession(await headers());
  if (!session) throw new HostingSessionRequiredError();
  const issuer = new URL(process.env.WEBDOCK_AUTH_ISSUER || "https://auth.webdock.dev/api/auth");
  const local = process.env.NODE_ENV !== "production" && issuer.protocol === "http:" && ["localhost", "127.0.0.1"].includes(issuer.hostname);
  const id = process.env.WEBDOCK_SSO_CLIENT_ID, secret = process.env.WEBDOCK_SSO_CLIENT_SECRET;
  if ((!local && issuer.protocol !== "https:") || issuer.username || issuer.password || !id || !secret) throw new HostingError(503, "Database authentication is unavailable.");
  let response: Response;
  try {
    response = await fetch(new URL("/api/databases/bridge", issuer), { method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { "Content-Type": "application/json", Authorization: "Basic "+Buffer.from(`${id}:${secret}`).toString("base64") },
      body: JSON.stringify({ accessToken: session.accessToken, command: databaseCommand.parse(command) }) });
  } catch { throw new HostingError(503, "Database service is unavailable."); }
  const reader = response.body?.getReader(); if (!reader) throw new HostingError(502, "Invalid database response.");
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength;
    if (size > 1_000_000) throw new HostingError(502, "Invalid database response."); chunks.push(next.value); }
  } finally { await reader.cancel().catch(() => {}); }
  let result;
  try { result = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new HostingError(502, "Invalid database response."); }
  if (!response.ok) throw new HostingError(response.status, typeof result.error === "string" ? result.error : "Database service is unavailable.");
  return result.data as T;
}
