import type { Payload } from "payload";
import type { RegistryActor } from "./registry";
export const mcpOrigin = () => process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3120";
export const mcpResource = () => `${mcpOrigin()}/api/mcp`;
export const mcpIssuer = () => process.env.WEBDOCK_AUTH_ISSUER || "https://auth.webdock.dev/api/auth";
export function challenge(status: 401 | 403, scope = "webdock:read") {
  return Response.json({ error: status === 401 ? "Authentication required" : "Insufficient scope" }, { status, headers: { "Cache-Control": "no-store", "WWW-Authenticate": `Bearer resource_metadata="${mcpOrigin()}/.well-known/oauth-protected-resource/api/mcp", scope="${scope}"${status === 403 ? ', error="insufficient_scope"' : ''}` } });
}
export function validateMCPToken(value: unknown, resource: string, issuer: string) {
  if (!value || typeof value !== "object") return null;
  const token = value as Record<string, unknown>;
  const aud = Array.isArray(token.aud) ? token.aud : [token.aud];
  if (token.active !== true || token.disabled === true || token.webdock_role !== "operator" || token.iss !== issuer || !aud.includes(resource) || typeof token.sub !== "string" || typeof token.exp !== "number" || token.exp <= Date.now() / 1000 || typeof token.scope !== "string" || token.token_type !== "Bearer") return null;
  return { subject: token.sub, scopes: new Set(token.scope.split(" ")) };
}
export async function introspectMCP(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 16384) return null;
  const clientID = process.env.WEBDOCK_SSO_CLIENT_ID, secret = process.env.WEBDOCK_SSO_CLIENT_SECRET;
  if (!clientID || !secret) return null;
  const response = await fetch(new URL("/api/mcp/introspect", mcpIssuer()), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: authorization.slice(7), client_id: clientID, client_secret: secret }), cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) return null;
  return response.json();
}

export async function authenticateMCP(request: Request) {
  return validateMCPToken(await introspectMCP(request), mcpResource(), mcpIssuer());
}

export async function authorizeRegistry(request: Request, write: boolean, dependencies: { getCMS: () => Promise<Payload>; authenticate?: typeof authenticateMCP }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== mcpOrigin()) return Response.json({ error: "Invalid origin" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  let identity;
  try { identity = await (dependencies.authenticate || authenticateMCP)(request); }
  catch { return Response.json({ error: "Authorization unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  if (!identity) return challenge(401);
  if (!identity.scopes.has("webdock:read") || (write && !identity.scopes.has("webdock:write"))) return challenge(403, write ? "webdock:read webdock:write" : "webdock:read");
  const payload = await dependencies.getCMS();
  const matches = await payload.find({ collection: "users", where: { authSubject: { equals: identity.subject } }, limit: 1, depth: 0, overrideAccess: true });
  const user = matches.docs[0];
  if (!user || user.role !== "operator") return Response.json({ error: "Operator access required" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return { actor: { payload, user: { ...user, collection: "users" }, accessToken: request.headers.get("authorization")?.slice(7) } as RegistryActor, canWrite: identity.scopes.has("webdock:write") };
}
