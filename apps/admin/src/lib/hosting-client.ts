import {vercelSettings} from "./vercel-settings";
import { withHostingPageAccess, HostingSessionRequiredError } from "./hosting-page-access";
import "server-only";
import { headers } from "next/headers";
import { HostingError, type HostingCommand } from "@webdock/hosting-contracts";
import { sso } from "./sso";
export async function hostingTokenCall<T = unknown>(
  accessToken: string,
  command:
    HostingCommand | { action: "enrollment.display"; enrollmentID: string },
): Promise<T> {
  const issuer = new URL(
    process.env.WEBDOCK_AUTH_ISSUER || "https://auth.webdock.dev/api/auth",
  );
  const local =
    process.env.NODE_ENV !== "production" &&
    issuer.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(issuer.hostname);
  const id = process.env.WEBDOCK_SSO_CLIENT_ID,
    secret = process.env.WEBDOCK_SSO_CLIENT_SECRET;
  if (
    (issuer.protocol !== "https:" && !local) ||
    issuer.username ||
    issuer.password ||
    !id ||
    !secret
  )
    throw new HostingError(503, "Hosting authentication is unavailable.");
  const vercel=(command.action==='byok.vercel.begin'||command.action==='byok.vercel.finish')?vercelSettings():null;
  // Shared confidential backend channel; never expose integration credentials in a
  // public command, response, cookie, log or persistent Auth configuration.
  const vercelRuntime=vercel?{clientID:vercel.clientID,clientSecret:vercel.clientSecret,slug:vercel.slug,origin:vercel.origin,platformTeam:vercel.teamID}:undefined;
  let response: Response;
  try {
    response = await fetch(new URL("/api/hosting/bridge", issuer), {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      },
      body: JSON.stringify({ accessToken, command,vercelRuntime }),
    });
  } catch {
    throw new HostingError(
      503,
      "Hosting is unavailable. Check the current state before retrying.",
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new HostingError(502, "Invalid hosting response.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) {
        await reader.cancel();
        throw new HostingError(502, "Invalid hosting response.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let result;
  try {
    result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HostingError(502, "Invalid hosting response.");
  }
  if (!response.ok)
    throw new HostingError(
      response.status,
      typeof result.error === "string"
        ? result.error
        : "Hosting is unavailable.",
    );
  return result.data as T;
}
export async function hostingCall<T = unknown>(
  command:
    HostingCommand | { action: "enrollment.display"; enrollmentID: string },
): Promise<T> {
  const session = sso && (await sso.getDelegatedSession(await headers()));
  if (!session) throw new HostingSessionRequiredError();
  return hostingTokenCall<T>(session.accessToken, command);
}

/** Server Component entrypoint. Mutations continue using hostingCall to preserve drafts. */
export function hostingPageCall<T = unknown>(
  command: HostingCommand,
  returnTo: string,
): Promise<T> {
  return withHostingPageAccess(returnTo, () => hostingCall<T>(command));
}
