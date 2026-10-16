import { studioOperationDomain } from "./operation-domain";
import {
  browserAuthProvider,
  clerkBrowserSession,
} from "../auth/clerk-runtime";
import { ClerkSessionUnavailable } from "../auth/clerk-bridge";
import {
  withTrustedLocalSession,
  trustedLocalSessionKind,
} from "../auth/principal";
import {
  requireInstalledOperation,
  publicInstallation,
} from "../../installation";
import { ModuleError } from "@webdock/module-sdk";
import {
  billingJobs,
  retryReadJob,
  enqueueCustomerRead,
} from "../billing/operations";
import { releaseToManual, operatorCustomerBilling } from "../billing/manual";
import {
  quoteSubscriptionChange,
  changeSubscription,
  resumeSubscriptionChange,
} from "../billing/subscriptions";
import { quotePurchase, createCheckout } from "../billing/checkout";
import { tenantBilling, resumeCheckout } from "../billing/view";
import { createCustomerPortal } from "../billing/portal";
import {
  enableSandboxCustomer,
  createOffer,
  revokeOffer,
  getBillingOffer,
} from "../billing/offers";
import { ZodError } from "zod";
import {
  setProductAvailability,
  createProductVersion,
  listProducts,
  publishProduct,
} from "../billing/catalog";
import { setupEndpoint } from "../billing/endpoints";
import { BillingError } from "../billing/types";
import { billingActor } from "../billing/context";
import {
  connectionStatus,
  saveConnection,
  updateSwitches,
} from "../billing/connection";
import {
  previewProjectDeletion,
  deleteProject,
} from "../lifecycle/project-deletion";
import { vercelView, linkVercelProject } from "../integrations/vercel/view";
import { projectVercelStatus } from "../integrations/vercel/vercel-project";
import { currentRegistryActor } from "../integrations/operator";
import { githubView } from "../integrations/github/view";
import { hostingCall } from "./hosting";
import { HostingError } from "@webdock/hosting-contracts";
import { registryService } from "../registry/context";
import { RegistryError } from "../registry/service";
import { currentDatabaseScope } from "@webdock/database-runtime";
import { cmsShapes, dispatchCMS } from "../cms-bridge/dispatch";
import { CMSBridgeError } from "../cms-bridge/errors";
import { withNativeHeaders } from "./request-context";
import {
  getConnections,
  registerConnection,
  disableConnection,
} from "../auth/connections";
import { mailStudioShapes, dispatchMailStudio } from "../mail/product/studio";
import { MailError } from "../mail/product/access";
import { MailValidationError } from "@webdock/mail-contracts/validation";
import { getNativeSending, manageNativeSending } from "../mail/mail-sending";
import { getTenantMailboxes, manageTenantMailboxes } from "../mail/mailboxes";
import { launchTenantWebmail } from "../mail/mail-sessions";
// Server-only delegation boundary: native cookies never leave this module.
import { APIError, serializeSignedCookie } from "better-call";
import { auth } from "../auth/auth";
import { database, authDatabase } from "../../db/runtime";
import { withDatabaseScope } from "@webdock/database-runtime";
import {
  currentTenantPreview,
  startTenantPreview,
  exitTenantPreview,
  dispatchTenantPreview,
} from "../access/tenant-preview";
import { currentMCPClaims } from "../auth/mcp";
import {
  AccessError,
  accountSites,
  listAccess,
  manageAccess,
  requireAccessOperator,
} from "../access/access-management";
import {
  listTenants,
  listTenantInvitations,
  getTenant,
  manageTenant,
} from "../access/tenants";
import {
  PlanError,
  getPlans,
  getTenantPlan,
  managePlans,
  getOffer,
  acceptOffer,
} from "../plans/plans";
import {
  TenantMailError,
  getTenantMail,
  manageTenantMail,
} from "../mail/tenant-mail";
import {
  MailServiceError,
  getTenantMailService,
  manageTenantMailService,
} from "../mail/mail-service";
import {
  MailDomainsError,
  getTenantSenderDomains,
  manageTenantSenderDomain,
} from "../mail/mail-domains";
import {
  MailKeysError,
  getTenantMailKeys,
  manageTenantMailKeys,
  type MailKeyInput,
} from "../mail/mail-keys";
import {
  TrackingError,
  getTenantTracking,
  manageTenantTracking,
} from "../mail/mail-tracking";
import {
  StorageUsageError,
  getTenantStorage,
  manageTenantStorage,
} from "../platform/storage-usage";
import {
  PlatformError,
  getPlatformSettings,
  getMailConnectionStatus,
  savePlatformSettings,
  saveMailCredentials,
  clearMailCredentials,
  testMailConnection,
} from "../platform/platform";

const bodyLimit = 128 * 1024;
class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(status: number, message: string): never {
  throw new RequestError(status, message);
}
function invalid(): never {
  return fail(400, "Invalid Studio request.");
}
function unauthorized(): never {
  return fail(401, "Sign in to Studio again.");
}
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isString = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 32768;
const isInput = (value: unknown): value is Record<string, string> =>
  isObject(value) &&
  Object.keys(value).length <= 100 &&
  Object.values(value).every(isString);
const isMailKeyInput = (value: unknown): value is MailKeyInput =>
  isObject(value) &&
  isString(value.action) &&
  Object.entries(value).every(([key, field]) =>
    ["permissions", "ips"].includes(key)
      ? Array.isArray(field) && field.length <= 100 && field.every(isString)
      : ["action", "label", "consumerKey", "confirm"].includes(key) &&
        isString(field),
  );
const shapes: Record<string, ((value: unknown) => boolean)[]> = {
  ...mailStudioShapes,
  ...cmsShapes,
  "project.preview": [isString],
  "project.delete": [isString, isObject],
  "integrations.github": [isInput],
  "integrations.vercel": [isString],
  "integrations.linkVercel": [isInput],
  "integrations.projectStatus": [isString],
  "hosting.command": [isObject],
  "database.command": [isObject],
  "billing.changeQuote": [isObject],
  "billing.change": [isObject],
  "billing.resumeChange": [isObject],
  "billing.tenant": [isObject],
  "billing.quote": [isObject],
  "billing.checkout": [isObject],
  "billing.resume": [isObject],
  "billing.portal": [isObject],
  "billing.offer": [isString],
  "billing.createOffer": [isObject],
  "billing.revokeOffer": [isString],
  "billing.enableSandbox": [isString],
  "billing.refreshCustomer": [isObject],
  "billing.jobs": [isString],
  "billing.retryReadJob": [isString],
  "billing.manualRelease": [isObject],
  "billing.operatorCustomer": [isObject],
  "billing.availability": [isObject],
  "billing.products": [isString],
  "billing.createVersion": [isObject],
  "billing.publish": [isObject],
  "billing.archive": [isObject],
  "billing.endpoint": [isObject],
  "billing.connection": [isString],
  "billing.saveConnection": [isObject],
  "billing.switches": [isObject],
  "registry.session": [],
  "registry.query": [isString, isObject],
  "registry.customer": [(value) => value === null || isString(value), isObject],
  "registry.project": [(value) => value === null || isString(value), isObject],
  "registry.instance": [
    (value) => value === null || isString(value),
    isObject,
    (value) => typeof value === "boolean",
  ],
  "registry.archive": [
    isString,
    isString,
    (value) => typeof value === "boolean",
  ],
  getConnections: [],
  registerConnection: [isInput],
  disableConnection: [isString],
  startTenantPreview: [isString],
  exitTenantPreview: [],
  session: [],
  requireAccessOperator: [],
  listAccess: [isString],
  manageAccess: [isInput],
  accountSites: [],
  listTenants: [],
  listTenantInvitations: [],
  getTenant: [isString],
  manageTenant: [isString, isInput],
  getPlans: [],
  getTenantPlan: [isString],
  managePlans: [isInput],
  getOffer: [isString],
  acceptOffer: [isString],
  getTenantMail: [isString],
  manageTenantMail: [isString, isInput],
  getTenantMailboxes: [isString],
  manageTenantMailboxes: [isString, isInput],
  launchTenantWebmail: [isString, isString],
  getNativeSending: [isString],
  manageNativeSending: [isString, isInput],
  getTenantMailService: [isString],
  manageTenantMailService: [isString, isInput],
  getTenantSenderDomains: [isString],
  manageTenantSenderDomain: [
    isString,
    (value) =>
      isInput(value) &&
      ["register", "refresh", "unregister"].includes(value.action) &&
      isString(value.domainID),
  ],
  getTenantMailKeys: [isString],
  manageTenantMailKeys: [isString, isMailKeyInput],
  getTenantTracking: [isString],
  manageTenantTracking: [isString, isInput],
  getTenantStorage: [isString],
  manageTenantStorage: [isString, isInput],
  getPlatformSettings: [],
  getMailConnectionStatus: [],
  savePlatformSettings: [isInput],
  saveMailCredentials: [isString, isString],
  clearMailCredentials: [],
  testMailConnection: [],
};

async function readBody(request: Request, native = false) {
  if (request.method !== "POST") fail(405, "Use POST.");
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    invalid();
  if (Number(request.headers.get("content-length")) > 2_200_000)
    fail(413, "Studio request is too large.");
  if (!request.body) invalid();
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 2_200_000) {
        await reader.cancel();
        fail(413, "Studio request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    if (length > bodyLimit) fail(413, "Studio request is too large.");
    invalid();
  }
  if (
    length >
    (isObject(body) &&
    typeof body.operation === "string" &&
    Object.hasOwn(cmsShapes, body.operation)
      ? 2_200_000
      : bodyLimit)
  )
    fail(413, "Studio request is too large.");
  if (
    !isObject(body) ||
    Object.keys(body).some(
      (key) =>
        !(
          native ? ["operation", "args"] : ["operation", "args", "accessToken"]
        ).includes(key),
    ) ||
    !isString(body.operation) ||
    !Object.hasOwn(shapes, body.operation) ||
    !Array.isArray(body.args) ||
    (!native && (!isString(body.accessToken) || !body.accessToken))
  )
    invalid();
  const { operation, args, accessToken } = body;
  if (length > (Object.hasOwn(cmsShapes, operation) ? 2_200_000 : bodyLimit))
    fail(413, "Studio request is too large.");
  const validators = shapes[operation];
  if (
    args.length !== validators.length ||
    validators.some((validate, index) => !validate(args[index]))
  )
    invalid();
  return {
    operation,
    args,
    accessToken: typeof accessToken === "string" ? accessToken : "",
  };
}

type Dependencies = {
  introspect?: (request: Request) => Promise<Response>;
  browserHeaders?: Headers;
};
async function delegatedSession(
  request: Request,
  accessToken: string,
  dependencies: Dependencies,
) {
  const clientID = process.env.WEBDOCK_STUDIO_CLIENT_ID;
  const basic = request.headers.get("authorization") || "";
  if (
    !clientID ||
    !/^Basic [A-Za-z0-9+/]+=*$/i.test(basic) ||
    basic.length > 16384
  )
    unauthorized();
  const credentials = Buffer.from(basic.slice(6), "base64").toString("utf8");
  if (
    credentials.slice(0, credentials.indexOf(":")) !== clientID ||
    !credentials.slice(credentials.indexOf(":") + 1)
  )
    unauthorized();
  const origin = new URL(process.env.BETTER_AUTH_URL || "http://localhost:3125")
    .origin;
  // Only this native endpoint verifies the confidential client credentials and token.
  // Never forward a caller-controlled URL, cookie, origin or proxy header.
  const response = await (dependencies.introspect || auth.handler)(
    new Request(origin + "/api/auth/oauth2/introspect", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      // The registered client uses client_secret_post. Basic is only the private
      // bridge transport; native OAuth verifies the exact supplied credentials.
      body: new URLSearchParams({
        token: accessToken,
        token_type_hint: "access_token",
        client_id: clientID!,
        client_secret: credentials.slice(credentials.indexOf(":") + 1),
      }),
    }),
  );
  if (!response.ok) {
    if ([400, 401, 403].includes(response.status)) unauthorized();
    fail(
      response.status === 429 ? 429 : 503,
      "Studio is temporarily unavailable. Try again.",
    );
  }
  const token: unknown = await response.json();
  if (
    !isObject(token) ||
    token.active !== true ||
    token.disabled === true ||
    token.client_id !== clientID ||
    !isString(token.sub) ||
    !token.sub ||
    !isString(token.sid) ||
    !token.sid ||
    typeof token.exp !== "number" ||
    !Number.isFinite(token.exp) ||
    token.exp * 1000 <= Date.now()
  )
    unauthorized();
  const session = (
    await authDatabase.query(
      'SELECT token FROM webdock_auth.session WHERE id=$1 AND "userId"=$2 AND "expiresAt">now()',
      [token.sid, token.sub],
    )
  ).rows[0];
  if (!session) unauthorized();
  const context = await auth.$context;
  const cookie = await serializeSignedCookie(
    context.authCookies.sessionToken.name,
    session.token,
    context.secret,
  );
  const headers = new Headers({ Origin: origin, Cookie: cookie.split(";")[0] });
  const native = await auth.api.getSession({ headers });
  if (
    !native ||
    native.session.id !== token.sid ||
    native.user.id !== token.sub ||
    native.user.banned ||
    !native.user.emailVerified ||
    native.user.mustChangePassword
  )
    unauthorized();
  const operator = !(await currentMCPClaims(native.user.id)).disabled;
  if (native.user.role !== "user" && !operator) unauthorized();
  const {
    id,
    name,
    email,
    role,
    emailVerified,
    twoFactorEnabled,
    mustChangePassword,
  } = native.user;
  return {
    headers,
    actor: { userID: id, sessionID: native.session.id },
    safe: {
      user: {
        id,
        name,
        email,
        role,
        emailVerified,
        twoFactorEnabled,
        mustChangePassword,
      },
      operator,
    },
  };
}

async function dispatch(
  operation: string,
  args: unknown[],
  headers: Headers,
  safe:
    | Awaited<ReturnType<typeof delegatedSession>>["safe"]
    | Awaited<ReturnType<typeof clerkBrowserSession>>["safe"],
) {
  // Shape checks happen before dispatch; every original service still checks live permissions.
  const text = args[0] as string,
    input = args[0] as Record<string, string>,
    tenantInput = args[1] as Record<string, string>;
  if (operation === "billing.changeQuote")
    return quoteSubscriptionChange(billingActor(), args[0]);
  if (operation === "billing.change")
    return changeSubscription(billingActor(), args[0]);
  if (operation === "billing.resumeChange")
    return resumeSubscriptionChange(billingActor(), args[0]);
  if (operation === "billing.tenant")
    return tenantBilling(billingActor(), args[0]);
  if (operation === "billing.quote")
    return quotePurchase(billingActor(), args[0]);
  if (operation === "billing.checkout")
    return createCheckout(billingActor(), args[0]);
  if (operation === "billing.resume")
    return resumeCheckout(billingActor(), args[0]);
  if (operation === "billing.portal")
    return createCustomerPortal(billingActor(), args[0]);
  if (operation === "billing.offer")
    return getBillingOffer(billingActor(), args[0]);
  if (operation === "hosting.command" || operation === "database.command")
    return hostingCall(
      args[0],
      operation === "hosting.command" ? "hosting" : "database",
    );
  if (Object.hasOwn(mailStudioShapes, operation))
    return dispatchMailStudio(operation, args, headers);
  switch (operation) {
    case "session":
      return safe;
    case "requireAccessOperator":
      await requireAccessOperator(headers);
      return safe;
    case "listAccess":
      return listAccess(headers, text);
    case "manageAccess":
      return manageAccess(headers, input);
    case "accountSites":
      return accountSites(headers);
    case "listTenants":
      return listTenants(headers);
    case "listTenantInvitations":
      return listTenantInvitations(headers);
    case "getTenant":
      return getTenant(headers, text);
    case "manageTenant":
      return manageTenant(headers, text, tenantInput);
    case "getPlans":
      return getPlans(headers);
    case "getTenantPlan":
      return getTenantPlan(headers, text);
    case "managePlans":
      return managePlans(headers, input);
    case "getOffer":
      return getOffer(headers, text);
    case "acceptOffer":
      return acceptOffer(headers, text);
    case "getTenantMail":
      return getTenantMail(headers, text);
    case "getTenantMailboxes":
      return getTenantMailboxes(headers, text);
    case "launchTenantWebmail":
      return launchTenantWebmail(headers, text, args[1] as string);
    case "manageTenantMailboxes":
      return manageTenantMailboxes(headers, text, tenantInput);
    case "getNativeSending":
      return getNativeSending(headers, text);
    case "manageNativeSending":
      return manageNativeSending(headers, text, tenantInput);
    case "getTenantMailService":
      return getTenantMailService(headers, text);
    case "manageTenantMailService":
      return manageTenantMailService(headers, text, tenantInput);
    case "manageTenantMail":
      return manageTenantMail(headers, text, tenantInput);
    case "getTenantSenderDomains":
      return getTenantSenderDomains(headers, text);
    case "manageTenantSenderDomain":
      return manageTenantSenderDomain(
        headers,
        text,
        args[1] as Parameters<typeof manageTenantSenderDomain>[2],
      );
    case "getTenantMailKeys":
      return getTenantMailKeys(headers, text);
    case "manageTenantMailKeys":
      return manageTenantMailKeys(headers, text, args[1] as MailKeyInput);
    case "getTenantTracking":
      return getTenantTracking(headers, text);
    case "manageTenantTracking":
      return manageTenantTracking(headers, text, tenantInput);
    case "getTenantStorage":
      return getTenantStorage(headers, text);
    case "manageTenantStorage":
      return manageTenantStorage(headers, text, tenantInput);
  }
  // Even platform reads and connection tests require current root authorization.
  await requireAccessOperator(headers);
  if (operation === "billing.createOffer")
    return createOffer(billingActor(), args[0]);
  if (operation === "billing.revokeOffer")
    return revokeOffer(billingActor(), args[0]);
  if (operation === "billing.enableSandbox")
    return enableSandboxCustomer(billingActor(), args[0]);
  if (operation === "billing.refreshCustomer")
    return enqueueCustomerRead(billingActor(), args[0]);
  if (operation === "billing.jobs") return billingJobs(billingActor(), args[0]);
  if (operation === "billing.retryReadJob")
    return retryReadJob(billingActor(), args[0]);
  if (operation === "billing.manualRelease")
    return releaseToManual(billingActor(), args[0]);
  if (operation === "billing.operatorCustomer")
    return operatorCustomerBilling(billingActor(), args[0]);
  if (operation === "billing.availability")
    return setProductAvailability(billingActor(), args[0]);
  if (operation === "billing.products")
    return listProducts(billingActor(), text as "sandbox" | "live");
  if (operation === "billing.createVersion")
    return createProductVersion(billingActor(), args[0]);
  if (operation === "billing.archive")
    return (await import("../billing/catalog")).archiveProduct(
      billingActor(),
      args[0],
    );
  if (operation === "billing.publish")
    return publishProduct(billingActor(), args[0]);
  if (operation === "billing.endpoint")
    return setupEndpoint(billingActor(), args[0]);
  if (operation === "billing.connection")
    return connectionStatus(billingActor(), text as "sandbox" | "live");
  if (operation === "billing.saveConnection")
    return saveConnection(billingActor(), args[0]);
  if (operation === "billing.switches")
    return updateSwitches(billingActor(), args[0]);
  if (operation.startsWith("registry.")) {
    const scope = currentDatabaseScope();
    if (scope?.kind !== "session")
      throw new AccessError("Authenticated session required.");
    const registry = await registryService(),
      actor = { subject: scope.subject, sessionID: scope.sessionID };
    switch (operation) {
      case "registry.session":
        return registry.operator(actor);
      case "registry.query":
        return registry.query(actor, text, args[1] as Record<string, unknown>);
      case "registry.customer":
        return registry.writeCustomer(actor, args[0] as string | null, args[1]);
      case "registry.project":
        return registry.writeProject(actor, args[0] as string | null, args[1]);
      case "registry.instance":
        return registry.writeInstance(
          actor,
          args[0] as string | null,
          args[1],
          args[2] as boolean,
        );
      case "registry.archive":
        if (!["customers", "projects"].includes(text)) invalid();
        return registry.archive(
          actor,
          text as "customers" | "projects",
          args[1] as string,
          args[2] as boolean,
        );
    }
  }
  switch (operation) {
    case "project.preview":
      return previewProjectDeletion(await currentRegistryActor(), text);
    case "project.delete":
      return deleteProject(await currentRegistryActor(), text, args[1]);
    case "integrations.vercel":
      return vercelView(text);
    case "integrations.linkVercel":
      return linkVercelProject(input);
    case "integrations.projectStatus":
      return projectVercelStatus(await currentRegistryActor(), text);
    case "integrations.github":
      return githubView(input);
    case "getConnections":
      return getConnections(headers);
    case "registerConnection":
      return registerConnection(headers, input);
    case "disableConnection":
      return disableConnection(headers, text);
    case "getPlatformSettings":
      return getPlatformSettings();
    case "getMailConnectionStatus":
      return getMailConnectionStatus();
    case "savePlatformSettings":
      return savePlatformSettings(safe.user.id, input);
    case "saveMailCredentials":
      return saveMailCredentials(safe.user.id, text, args[1] as string);
    case "clearMailCredentials":
      return clearMailCredentials(safe.user.id);
    case "testMailConnection":
      return testMailConnection();
    default:
      invalid();
  }
}

export function handleStudioRequest(
  request: Request,
  dependencies: Dependencies = {},
): Promise<Response> {
  return handleRequest(request, dependencies, false);
}
export function handleNativeStudioRequest(request: Request): Promise<Response> {
  return browserAuthProvider === "better-auth" ||
    trustedLocalSessionKind(request.headers) === "clerk"
    ? handleRequest(request, {}, true)
    : Promise.resolve(new Response(null, { status: 404 }));
}
export function handleClerkStudioRequest(request: Request): Promise<Response> {
  if (browserAuthProvider !== "clerk" || !clerkBrowserSession)
    return Promise.resolve(new Response(null, { status: 404 }));
  return handleRequest(request, {}, true, true);
}
async function nativeSession(headers: Headers) {
  const native = await auth.api.getSession({ headers });
  if (
    !native ||
    native.user.banned ||
    !native.user.emailVerified ||
    native.user.mustChangePassword
  )
    unauthorized();
  const operator = !(await currentMCPClaims(native.user.id)).disabled;
  if (native.user.role !== "user" && !operator) unauthorized();
  const {
    id,
    name,
    email,
    role,
    emailVerified,
    twoFactorEnabled,
    mustChangePassword,
  } = native.user;
  return {
    headers,
    actor: { userID: id, sessionID: native.session.id },
    safe: {
      user: {
        id,
        name,
        email,
        role,
        emailVerified,
        twoFactorEnabled,
        mustChangePassword,
      },
      operator,
    },
  };
}
async function handleRequest(
  request: Request,
  dependencies: Dependencies,
  native: boolean,
  clerk = false,
): Promise<Response> {
  const responseHeaders = { "Cache-Control": "no-store", Pragma: "no-cache" };
  try {
    if (
      native &&
      request.headers.get("origin") !==
        new URL(
          (clerk
            ? process.env.WEBDOCK_SSO_APP_ORIGIN
            : process.env.BETTER_AUTH_URL) || "http://localhost:3125",
        ).origin
    )
      fail(403, "Invalid origin.");
    const { operation, args, accessToken } = await readBody(request, native);
    const { headers, actor, safe } = clerk
      ? await clerkBrowserSession!(request.headers)
      : native
        ? await nativeSession(request.headers)
        : await delegatedSession(request, accessToken, dependencies);
    requireInstalledOperation(operation, args);
    if (process.env.WEBDOCK_API_DOMAINS !== undefined) {
      const domain = studioOperationDomain(operation, args);
      if (!process.env.WEBDOCK_API_DOMAINS.split(",").includes(domain))
        fail(503, "This service is temporarily unavailable.");
    }
    return await withTrustedLocalSession(
      headers,
      { subject: actor.userID, sessionID: actor.sessionID },
      clerk ? "clerk" : (trustedLocalSessionKind(headers) ?? "legacy"),
      () =>
        withDatabaseScope(
          {
            kind: "session",
            subject: actor.userID,
            sessionID: actor.sessionID,
          },
          async () => {
            // The context comes from the authenticated central session, never a caller hint.
            // An expired context remains present and restrictive until explicit exit.
            const context = await currentTenantPreview(actor);
            let data: unknown;
            if (Object.hasOwn(cmsShapes, operation))
              data = await withNativeHeaders(
                headers,
                () => dispatchCMS(operation, args),
                dependencies.browserHeaders || request.headers,
                accessToken,
              );
            else if (
              operation === "hosting.command" ||
              operation === "database.command"
            )
              data = await withNativeHeaders(
                headers,
                () => dispatch(operation, args, headers, safe),
                dependencies.browserHeaders || request.headers,
                accessToken,
              );
            else if (operation === "exitTenantPreview")
              data = await exitTenantPreview(actor);
            else if (operation === "session" && context)
              data = {
                ...safe,
                user: { ...safe.user, role: "user" },
                operator: false,
                preview: context.preview,
              };
            else if (context) {
              try {
                data = await dispatchTenantPreview(
                  context,
                  operation,
                  args,
                  headers,
                );
              } catch (error) {
                if (error instanceof AccessError) {
                  // readBody already restricted operation to our fixed shapes registry.
                  // Log the actual actor and scoped tenant, never arguments or tokens.
                  await database.query(
                    "INSERT INTO webdock_auth.access_event(actor_id,action,target_id,outcome) VALUES($1,$2,$3,'denied')",
                    [
                      actor.userID,
                      `tenant-preview-denied:${operation}`,
                      context.preview.customerID,
                    ],
                  );
                }
                throw error;
              }
            } else if (operation === "startTenantPreview")
              data = await startTenantPreview(actor, args[0] as string);
            else
              data = await withNativeHeaders(
                headers,
                () => dispatch(operation, args, headers, safe),
                dependencies.browserHeaders || request.headers,
                accessToken,
              );
            return Response.json(
              {
                data:
                  operation === "session" && data
                    ? {
                        ...(data as object),
                        installation: publicInstallation(),
                      }
                    : (data ?? null),
              },
              { headers: responseHeaders },
            );
          },
        ),
    );
  } catch (error) {
    if (error instanceof ClerkSessionUnavailable)
      return Response.json(
        {
          error: {
            kind: "PortalSessionMissing",
            message:
              "Sign in with the configured provider and complete account setup.",
          },
        },
        { status: 401, headers: responseHeaders },
      );
    if (error instanceof ModuleError)
      return Response.json(
        {
          error: {
            kind: "ModuleError",
            code: error.code,
            message: error.message,
          },
        },
        { status: error.status, headers: responseHeaders },
      );
    if (error instanceof ZodError)
      return Response.json(
        {
          error: {
            kind: "StudioError",
            message: "Check the supplied details and try again.",
          },
        },
        { status: 400, headers: responseHeaders },
      );
    if (error instanceof BillingError)
      return Response.json(
        { error: { kind: "BillingError", message: error.message } },
        { status: error.status, headers: responseHeaders },
      );
    if (error instanceof HostingError)
      return Response.json(
        { error: { kind: "HostingError", message: error.message } },
        { status: error.status, headers: responseHeaders },
      );
    if (error instanceof RegistryError)
      return Response.json(
        { error: { kind: "RegistryError", message: error.message } },
        { status: error.status, headers: responseHeaders },
      );
    if (error instanceof CMSBridgeError)
      return Response.json(
        {
          error: {
            kind: "CMSBridgeError",
            message: error.message.slice(0, 300),
          },
        },
        { status: 400, headers: responseHeaders },
      );
    if (error instanceof MailError || error instanceof MailValidationError)
      return Response.json(
        { error: { kind: "MailProductError", message: error.message } },
        {
          status: error instanceof MailError ? error.status : 422,
          headers: responseHeaders,
        },
      );
    const known = (
      [
        ["AccessError", AccessError],
        ["PlanError", PlanError],
        ["TenantMailError", TenantMailError],
        ["MailServiceError", MailServiceError],
        ["MailDomainsError", MailDomainsError],
        ["MailKeysError", MailKeysError],
        ["TrackingError", TrackingError],
        ["StorageUsageError", StorageUsageError],
        ["PlatformError", PlatformError],
      ] as const
    ).find(([, type]) => error instanceof type);
    const status =
      error instanceof RequestError
        ? error.status
        : error instanceof AccessError || error instanceof APIError
          ? 403
          : known
            ? 400
            : 500;
    const kind = known?.[0] || (status < 500 ? "AccessError" : "Error");
    const message =
      error instanceof RequestError || (known && error instanceof Error)
        ? error.message
        : status === 403
          ? "This action is unavailable for your account or tenant."
          : status === 400
            ? "Could not complete this action. Check the supplied details and current settings."
            : "Studio is temporarily unavailable. Try again.";
    // Domain error classes contain reviewed public validation messages. Raw provider,
    // database and native authentication errors may contain secrets; never expose them.
    return Response.json(
      { error: { kind, message } },
      { status, headers: responseHeaders },
    );
  }
}
