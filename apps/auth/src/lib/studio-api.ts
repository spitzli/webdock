// Server-only delegation boundary: native cookies never leave this module.
import { APIError, serializeSignedCookie } from "better-call";
import { auth } from "./auth";
import { database } from "./db";
import { currentMCPClaims } from "./mcp";
import { AccessError, accountSites, listAccess, manageAccess, requireAccessOperator } from "./access-management";
import { listTenants, listTenantInvitations, getTenant, manageTenant } from "./tenants";
import { PlanError, getPlans, getTenantPlan, managePlans, getOffer, acceptOffer } from "./plans";
import { TenantMailError, getTenantMail, manageTenantMail } from "./tenant-mail";
import { MailDomainsError, getTenantSenderDomains, manageTenantSenderDomain } from "./mail-domains";
import { MailKeysError, getTenantMailKeys, manageTenantMailKeys, type MailKeyInput } from "./mail-keys";
import { TrackingError, getTenantTracking, manageTenantTracking } from "./mail-tracking";
import { StorageUsageError, getTenantStorage, manageTenantStorage } from "./storage-usage";
import { PlatformError, getPlatformSettings, getMailConnectionStatus, savePlatformSettings, saveMailCredentials, clearMailCredentials, testMailConnection } from "./platform";

const bodyLimit = 128 * 1024;
class RequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function fail(status: number, message: string): never { throw new RequestError(status, message); }
function invalid(): never { return fail(400, "Invalid Studio request."); }
function unauthorized(): never { return fail(401, "Sign in to Studio again."); }
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string" && value.length <= 32768;
const isInput = (value: unknown): value is Record<string, string> => isObject(value) && Object.keys(value).length <= 100 && Object.values(value).every(isString);
const isMailKeyInput = (value: unknown): value is MailKeyInput => isObject(value) && isString(value.action) && Object.entries(value).every(([key, field]) => ["permissions", "ips"].includes(key) ? Array.isArray(field) && field.length <= 100 && field.every(isString) : ["action", "label", "consumerKey", "confirm"].includes(key) && isString(field));
const shapes: Record<string, ((value: unknown) => boolean)[]> = {
  session: [], requireAccessOperator: [], listAccess: [isString], manageAccess: [isInput], accountSites: [],
  listTenants: [], listTenantInvitations: [], getTenant: [isString], manageTenant: [isString, isInput],
  getPlans: [], getTenantPlan: [isString], managePlans: [isInput], getOffer: [isString], acceptOffer: [isString],
  getTenantMail: [isString], manageTenantMail: [isString, isInput],
  getTenantSenderDomains: [isString], manageTenantSenderDomain: [isString, value => isInput(value) && ["register", "refresh", "unregister"].includes(value.action) && isString(value.domainID)],
  getTenantMailKeys: [isString], manageTenantMailKeys: [isString, isMailKeyInput],
  getTenantTracking: [isString], manageTenantTracking: [isString, isInput],
  getTenantStorage: [isString], manageTenantStorage: [isString, isInput],
  getPlatformSettings: [], getMailConnectionStatus: [], savePlatformSettings: [isInput], saveMailCredentials: [isString, isString], clearMailCredentials: [], testMailConnection: [],
};

async function readBody(request: Request) {
  if (request.method !== "POST") fail(405, "Use POST.");
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") invalid();
  if (Number(request.headers.get("content-length")) > bodyLimit) fail(413, "Studio request is too large.");
  if (!request.body) invalid();
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > bodyLimit) { await reader.cancel(); fail(413, "Studio request is too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { invalid(); }
  if (!isObject(body) || Object.keys(body).some(key => !["operation", "args", "accessToken"].includes(key)) || !isString(body.operation) || !Object.hasOwn(shapes, body.operation) || !Array.isArray(body.args) || !isString(body.accessToken) || !body.accessToken) invalid();
  const { operation, args, accessToken } = body;
  const validators = shapes[operation];
  if (args.length !== validators.length || validators.some((validate, index) => !validate(args[index]))) invalid();
  return { operation, args, accessToken };
}

type Dependencies = { introspect?: (request: Request) => Promise<Response> };
async function delegatedSession(request: Request, accessToken: string, dependencies: Dependencies) {
  const clientID = process.env.WEBDOCK_STUDIO_CLIENT_ID;
  const basic = request.headers.get("authorization") || "";
  if (!clientID || !/^Basic [A-Za-z0-9+/]+=*$/i.test(basic) || basic.length > 16384) unauthorized();
  const credentials = Buffer.from(basic.slice(6), "base64").toString("utf8");
  if (credentials.slice(0, credentials.indexOf(":")) !== clientID || !credentials.slice(credentials.indexOf(":") + 1)) unauthorized();
  const origin = new URL(process.env.BETTER_AUTH_URL || "http://localhost:3125").origin;
  // Only this native endpoint verifies the confidential client credentials and token.
  // Never forward a caller-controlled URL, cookie, origin or proxy header.
  const response = await (dependencies.introspect || auth.handler)(new Request(origin + "/api/auth/oauth2/introspect", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
    // The registered client uses client_secret_post. Basic is only the private
    // bridge transport; native OAuth verifies the exact supplied credentials.
    body: new URLSearchParams({ token: accessToken, token_type_hint: "access_token", client_id: clientID!, client_secret: credentials.slice(credentials.indexOf(":") + 1) }),
  }));
  if (!response.ok) unauthorized();
  const token: unknown = await response.json();
  if (!isObject(token) || token.active !== true || token.disabled === true || token.client_id !== clientID || !isString(token.sub) || !token.sub || !isString(token.sid) || !token.sid || typeof token.exp !== "number" || !Number.isFinite(token.exp) || token.exp * 1000 <= Date.now()) unauthorized();
  const session = (await database.query('SELECT token FROM webdock_auth.session WHERE id=$1 AND "userId"=$2 AND "expiresAt">now()', [token.sid, token.sub])).rows[0];
  if (!session) unauthorized();
  const context = await auth.$context;
  const cookie = await serializeSignedCookie(context.authCookies.sessionToken.name, session.token, context.secret);
  const headers = new Headers({ Origin: origin, Cookie: cookie.split(";")[0] });
  const native = await auth.api.getSession({ headers });
  if (!native || native.session.id !== token.sid || native.user.id !== token.sub || native.user.banned || !native.user.emailVerified || native.user.mustChangePassword) unauthorized();
  const operator = !(await currentMCPClaims(native.user.id)).disabled;
  if (native.user.role !== "user" && !operator) unauthorized();
  const { id, name, email, role, emailVerified, twoFactorEnabled, mustChangePassword } = native.user;
  return { headers, safe: { user: { id, name, email, role, emailVerified, twoFactorEnabled, mustChangePassword }, operator } };
}

async function dispatch(operation: string, args: unknown[], headers: Headers, safe: Awaited<ReturnType<typeof delegatedSession>>["safe"]) {
  // Shape checks happen before dispatch; every original service still checks live permissions.
  const text = args[0] as string, input = args[0] as Record<string, string>, tenantInput = args[1] as Record<string, string>;
  switch (operation) {
    case "session": return safe;
    case "requireAccessOperator": await requireAccessOperator(headers); return safe;
    case "listAccess": return listAccess(headers, text);
    case "manageAccess": return manageAccess(headers, input);
    case "accountSites": return accountSites(headers);
    case "listTenants": return listTenants(headers);
    case "listTenantInvitations": return listTenantInvitations(headers);
    case "getTenant": return getTenant(headers, text);
    case "manageTenant": return manageTenant(headers, text, tenantInput);
    case "getPlans": return getPlans(headers);
    case "getTenantPlan": return getTenantPlan(headers, text);
    case "managePlans": return managePlans(headers, input);
    case "getOffer": return getOffer(headers, text);
    case "acceptOffer": return acceptOffer(headers, text);
    case "getTenantMail": return getTenantMail(headers, text);
    case "manageTenantMail": return manageTenantMail(headers, text, tenantInput);
    case "getTenantSenderDomains": return getTenantSenderDomains(headers, text);
    case "manageTenantSenderDomain": return manageTenantSenderDomain(headers, text, args[1] as Parameters<typeof manageTenantSenderDomain>[2]);
    case "getTenantMailKeys": return getTenantMailKeys(headers, text);
    case "manageTenantMailKeys": return manageTenantMailKeys(headers, text, args[1] as MailKeyInput);
    case "getTenantTracking": return getTenantTracking(headers, text);
    case "manageTenantTracking": return manageTenantTracking(headers, text, tenantInput);
    case "getTenantStorage": return getTenantStorage(headers, text);
    case "manageTenantStorage": return manageTenantStorage(headers, text, tenantInput);
  }
  // Even platform reads and connection tests require current root authorization.
  await requireAccessOperator(headers);
  switch (operation) {
    case "getPlatformSettings": return getPlatformSettings();
    case "getMailConnectionStatus": return getMailConnectionStatus();
    case "savePlatformSettings": return savePlatformSettings(safe.user.id, input);
    case "saveMailCredentials": return saveMailCredentials(safe.user.id, text, args[1] as string);
    case "clearMailCredentials": return clearMailCredentials(safe.user.id);
    case "testMailConnection": return testMailConnection();
    default: invalid();
  }
}

export async function handleStudioRequest(request: Request, dependencies: Dependencies = {}): Promise<Response> {
  const responseHeaders = { "Cache-Control": "no-store", "Pragma": "no-cache" };
  try {
    const { operation, args, accessToken } = await readBody(request);
    const { headers, safe } = await delegatedSession(request, accessToken, dependencies);
    const data = await dispatch(operation, args, headers, safe);
    return Response.json({ data: data ?? null }, { headers: responseHeaders });
  } catch (error) {
    const known = ([["AccessError", AccessError], ["PlanError", PlanError], ["TenantMailError", TenantMailError], ["MailDomainsError", MailDomainsError], ["MailKeysError", MailKeysError], ["TrackingError", TrackingError], ["StorageUsageError", StorageUsageError], ["PlatformError", PlatformError]] as const).find(([, type]) => error instanceof type);
    const status = error instanceof RequestError ? error.status : error instanceof AccessError || error instanceof APIError ? 403 : known ? 400 : 500;
    const kind = known?.[0] || (status < 500 ? "AccessError" : "Error");
    const message = error instanceof RequestError || known && error instanceof Error ? error.message : status === 403 ? "This action is unavailable for your account or tenant." : status === 400 ? "Could not complete this action. Check the supplied details and current settings." : "Studio is temporarily unavailable. Try again.";
    // Domain error classes contain reviewed public validation messages. Raw provider,
    // database and native authentication errors may contain secrets; never expose them.
    return Response.json({ error: { kind, message } }, { status, headers: responseHeaders });
  }
}
