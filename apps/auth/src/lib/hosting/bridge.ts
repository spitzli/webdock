import { z } from "zod";
import {
  commandSchema,
  resourceID,
  HostingError,
  hostingError,
  type HostingActor,
} from "@webdock/hosting-contracts";
import { auth } from "../auth";
import { database } from "../db";
import { mcpResource, currentHostingMCPClaims } from "../mcp";
import { executeHosting } from "./service";
import { issueEnrollment } from "./clusters";
import { readHostingJSON, requireHostingEnvironment } from "./http";
const bodySchema = z
  .object({
    accessToken: z.string().min(1).max(16384),
    // Confidential Studio server context, never accepted by public command schemas.
    vercelRuntime:z.object({clientID:z.string().min(1).max(256),clientSecret:z.string().min(1).max(8192),slug:z.string().min(1).max(100),origin:z.string().url().max(300),platformTeam:z.string().max(160)}).strict().optional(),
    command: z.union([
      commandSchema,
      z
        .object({
          action: z.literal("enrollment.display"),
          enrollmentID: resourceID,
        })
        .strict(),
    ]),
  })
  .strict();
export async function hostingIdentity(
  request: Request,
  accessToken: string,
): Promise<HostingActor> {
  const clientID = process.env.WEBDOCK_STUDIO_CLIENT_ID,
    basic = request.headers.get("authorization") || "";
  if (
    !clientID ||
    basic.length > 16384 ||
    !/^Basic [A-Za-z0-9+/]+=*$/i.test(basic)
  )
    throw new HostingError(401, "Studio authentication required.");
  const credentials = Buffer.from(basic.slice(6), "base64").toString("utf8"),
    split = credentials.indexOf(":");
  if (credentials.slice(0, split) !== clientID || !credentials.slice(split + 1))
    throw new HostingError(401, "Studio authentication required.");
  const origin = new URL(process.env.BETTER_AUTH_URL || "http://localhost:3125")
    .origin;
  const response = await auth.handler(
    new Request(origin + "/api/auth/oauth2/introspect", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        token: accessToken,
        client_id: clientID,
        client_secret: credentials.slice(split + 1),
      }),
    }),
  );
  if (!response.ok) {
    if ([400, 401, 403].includes(response.status)) throw new HostingError(401, "Sign in again.");
    throw new HostingError(response.status === 429 ? 429 : 503, "Hosting is unavailable. Check the current state before retrying.");
  }
  const token = await response.json();
  if (
    token.active !== true ||
    token.disabled === true ||
    typeof token.sub !== "string" ||
    typeof token.sid !== "string" ||
    !token.sid ||
    typeof token.exp !== "number" ||
    !Number.isFinite(token.exp) ||
    token.exp * 1000 <= Date.now()
  )
    throw new HostingError(401, "Sign in again.");
  if (token.client_id === clientID)
    return {
      subject: token.sub,
      sessionID: token.sid,
      source: "studio",
      scopes: ["hosting:read", "hosting:write"],
    };
  const audiences = Array.isArray(token.aud) ? token.aud : [token.aud];
  const client = (
    await database.query(
      'SELECT metadata FROM webdock_auth."oauthClient" WHERE "clientId"=$1 AND NOT disabled',
      [token.client_id],
    )
  ).rows[0];
  let metadata;
  try {
    metadata =
      typeof client?.metadata === "string"
        ? JSON.parse(client.metadata)
        : client?.metadata;
  } catch {}
  const scopes = typeof token.scope === "string" ? token.scope.split(" ") : [];
  if (
    metadata?.webdock_hosting !== true ||
    metadata?.webdock_mcp === true ||
    !audiences.includes(mcpResource) ||
    !scopes.includes("hosting:read") ||
    scopes.some((s: string) => s.startsWith("webdock:")) ||
    (await currentHostingMCPClaims(token.sub)).disabled
  )
    throw new HostingError(403, "Hosting scope is required.");
  return { subject: token.sub, sessionID: token.sid, source: "oauth", scopes };
}
export async function hostingBridge(request: Request) {
  try {
    requireHostingEnvironment();
    if (request.method !== "POST") throw new HostingError(405, "Use POST.");
    const input = bodySchema.parse(await readHostingJSON(request));
    const actor = await hostingIdentity(request, input.accessToken);
    const data =
      input.command.action === "enrollment.display"
        ? await issueEnrollment(actor, input.command.enrollmentID)
        : await executeHosting(actor, input.command,input.vercelRuntime);
    return Response.json(
      { data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const safe = hostingError(error);
    return Response.json(
      { error: safe.message },
      { status: safe.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
