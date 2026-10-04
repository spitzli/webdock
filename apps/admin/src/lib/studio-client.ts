import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { sso } from "./sso";
import { AccessError, StudioError, studioError } from "./studio-errors";

const delegation = cache(async () => sso ? sso.getDelegatedSession(await headers()) : null);
export async function studioCall<T>(operation: string, args: unknown[] = []): Promise<T> {
  const session = await delegation();
  if (!session) throw new AccessError("Sign in to Studio to continue.", 401);
  const issuer = new URL(process.env.WEBDOCK_AUTH_ISSUER || "https://auth.webdock.dev/api/auth");
  const local = process.env.NODE_ENV !== "production" && issuer.protocol === "http:" && ["localhost", "127.0.0.1"].includes(issuer.hostname);
  if ((!local && issuer.protocol !== "https:") || issuer.username || issuer.password) throw new StudioError("Studio authentication is not configured.", 503);
  const clientID = process.env.WEBDOCK_SSO_CLIENT_ID, secret = process.env.WEBDOCK_SSO_CLIENT_SECRET;
  if (!clientID || !secret) throw new StudioError("Studio authentication is not configured.", 503);
  let response: Response;
  try {
    response = await fetch(new URL("/api/studio", issuer), {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(45_000),
      headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${clientID}:${secret}`).toString("base64")}` },
      body: JSON.stringify({ operation, args, accessToken: session.accessToken }),
    });
  } catch { throw new StudioError("Studio could not reach account services. Refresh and check the current state before retrying.", 503); }
  if (Number(response.headers.get("content-length")) > 2_000_000) throw new StudioError("Studio received an oversized response.", 502);
  const reader = response.body?.getReader();
  if (!reader) throw new StudioError("Studio received no response.", 502);
  let text = "", size = 0; const decoder = new TextDecoder();
  try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 2_000_000) throw new StudioError("Studio received an oversized response.", 502); text += decoder.decode(part.value, { stream: true }); } }
  finally { void reader.cancel().catch(() => {}); }
  let result: { data?: T; error?: { kind?: string; message?: string } };
  try { result = JSON.parse(text + decoder.decode()); } catch { throw new StudioError("Studio received an invalid response.", 502); }
  if (!response.ok || result.error) throw studioError(result.error?.kind || "StudioError", result.error?.message || "This operation is unavailable.", response.status);
  return result.data as T;
}
export type StudioSession = { user: { id: string; name: string; email: string; role: "operator" | "user"; emailVerified: boolean; twoFactorEnabled: boolean; mustChangePassword: boolean }; operator: boolean };
export const getStudioSession = cache(async (): Promise<StudioSession | null> => {
  try { return await studioCall<StudioSession>("session"); } catch (error) { if (error instanceof AccessError && error.status === 401) return null; throw error; }
});
