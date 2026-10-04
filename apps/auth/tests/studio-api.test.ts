import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { APIError } from "better-call";
import { auth } from "../src/lib/auth";
import { database } from "../src/lib/db";
import { createIdentity, registerApplication } from "../src/lib/bootstrap";
import { currentClaims } from "../src/lib/authorization";
import { handleStudioRequest } from "../src/lib/studio-api";

const databaseURL = new URL(process.env.DATABASE_URL!);
if (!["localhost", "127.0.0.1"].includes(databaseURL.hostname) || databaseURL.pathname !== "/webdock_admin_test" || process.env.AUTH_TEST_MAIL !== "true") throw Error("Disposable local database and test outbox required");
const origin = process.env.BETTER_AUTH_URL!;
test.after(async () => { await auth.$context; await database.end(); });
async function identity(operator = false) {
  const password = randomBytes(24).toString("base64url");
  const user = await createIdentity({ email: `studio-${randomBytes(8).toString("hex")}@example.invalid`, name: "Studio fixture", password, operator, mustChangePassword: false });
  const response = await auth.api.signInEmail({ body: { email: user.email, password }, asResponse: true });
  assert.equal(response.status, 200);
  const headers = new Headers({ Origin: origin, Cookie: response.headers.getSetCookie().map(c => c.split(";")[0]).join("; ") });
  const session = await auth.api.getSession({ headers });
  assert.ok(session);
  if (operator) await database.query('UPDATE webdock_auth."user" SET "twoFactorEnabled"=true WHERE id=$1', [user.id]);
  return { ...user, headers, session: session.session };
}
function request(operation: string, args: unknown[] = [], accessToken = "fixture-access-token", basic = "Basic " + Buffer.from(`${process.env.WEBDOCK_STUDIO_CLIENT_ID}:fixture-secret`).toString("base64")) {
  return new Request(origin + "/api/studio", { method: "POST", headers: { Authorization: basic, "Content-Type": "application/json", Cookie: "untrusted=native-cookie", Origin: "https://untrusted.example" }, body: JSON.stringify({ operation, args, accessToken }) });
}

test("Studio delegation validates live session identity, bounds inputs and retains tenant/root permissions", async () => {
  const operator = await identity(true), customer = await identity(), stranger = await identity();
  const app = await registerApplication({ label: "Studio delegation fixture", origin: "http://127.0.0.1:3120", logoutPath: "/login", headers: operator.headers });
  process.env.WEBDOCK_STUDIO_CLIENT_ID = app.clientID;
  const tenant = (await database.query("INSERT INTO webdock_admin.customers(id,name,notes) VALUES(webdock_auth.next_snowflake(),'Studio tenant','private operator note') RETURNING id")).rows[0];
  const org = (await database.query('SELECT organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$1', [tenant.id])).rows[0].organization_id;
  await database.query('INSERT INTO webdock_auth.member("organizationId","userId",role,"createdAt") VALUES($1,$2,\'admin\',now())', [org, customer.id]);
  const claims = { active: true, client_id: app.clientID, sub: customer.id, sid: customer.session.id, exp: Math.floor(Date.now() / 1000) + 300 };
  const introspect = async (incoming: Request) => {
    assert.equal(incoming.url, origin + "/api/auth/oauth2/introspect");
    assert.equal(incoming.headers.get("cookie"), null);
    assert.equal(incoming.headers.get("origin"), origin);
    assert.equal(incoming.headers.get("authorization"), null);
    const form = await incoming.formData();
    assert.equal(form.get("token"), "fixture-access-token");
    assert.equal(form.get("client_id"), app.clientID);
    assert.equal(form.get("client_secret"), "fixture-secret");
    return Response.json(claims);
  };
  let response = await handleStudioRequest(request("session"), { introspect });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  const safe = await response.json();
  assert.equal(safe.data.user.id, customer.id);
  assert.equal(safe.data.operator, false);
  assert.equal(safe.data.session, undefined);
  assert.equal(JSON.stringify(safe).includes(customer.session.token), false);
  response = await handleStudioRequest(request("listTenants"), { introspect });
  assert.deepEqual((await response.json()).data.map((t: {id: string}) => t.id), [tenant.id]);
  response = await handleStudioRequest(request("getTenant", [tenant.id]), { introspect });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.tenant.notes, undefined);
  for (const operation of ["requireAccessOperator", "listAccess", "getPlatformSettings", "getMailConnectionStatus", "testMailConnection", "clearMailCredentials", "saveMailCredentials", "savePlatformSettings"]) {
    const args = operation === "listAccess" ? [""] : operation === "saveMailCredentials" ? ["key", "secret"] : operation === "savePlatformSettings" ? [{}] : [];
    assert.equal((await handleStudioRequest(request(operation, args), { introspect })).status, 403, operation);
  }
  for (const altered of [{ active: false }, { disabled: true }, { client_id: "other-client" }, { sub: stranger.id }, { sid: stranger.session.id }, { sid: undefined }, { sub: undefined }, { exp: 1 }, { exp: undefined }]) {
    assert.equal((await handleStudioRequest(request("session"), { introspect: async () => Response.json({ ...claims, ...altered }) })).status, 401, JSON.stringify(altered));
  }
  for (const [operation, args] of [["__proto__", []], ["mailProvider", []], ["getTenant", [12]], ["listTenants", [operator.id]], ["manageTenant", [tenant.id, { name: { bad: true } }]], ["manageTenantMailKeys", [tenant.id, { action: "create", permissions: [23] }]]] as [string, unknown[]][]) {
    assert.equal((await handleStudioRequest(request(operation, args), { introspect })).status, 400, operation);
  }
  assert.equal((await handleStudioRequest(request("session", [], "x".repeat(140_000)), { introspect })).status, 413);
  assert.equal((await handleStudioRequest(request("session", [], "fixture-access-token", "Bearer wrong"), { introspect })).status, 401);
  const otherIdentity = { ...claims, sub: stranger.id, sid: stranger.session.id };
  assert.equal((await handleStudioRequest(request("getTenant", [tenant.id]), { introspect: async () => Response.json(otherIdentity) })).status, 403);
  await database.query('DELETE FROM webdock_auth.session WHERE id=$1', [customer.session.id]);
  assert.equal((await handleStudioRequest(request("session"), { introspect })).status, 401);
});

test("Studio customer claims need active membership but no CMS grant; native OAuth authenticates confidential delegation", async () => {
  const operator = await identity(true), customer = await identity();
  const app = await registerApplication({ label: "Native Studio fixture", origin: "http://127.0.0.1:3120", logoutPath: "/login", headers: operator.headers });
  process.env.WEBDOCK_STUDIO_CLIENT_ID = app.clientID;
  assert.equal((await currentClaims(customer.id, app.binding)).disabled, true);
  const tenant = (await database.query("INSERT INTO webdock_admin.customers(id,name) VALUES(webdock_auth.next_snowflake(),'Studio OAuth tenant') RETURNING id")).rows[0];
  const org = (await database.query('SELECT organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$1', [tenant.id])).rows[0].organization_id;
  await database.query('INSERT INTO webdock_auth.member("organizationId","userId",role,"createdAt") VALUES($1,$2,\'member\',now())', [org, customer.id]);
  assert.equal((await currentClaims(customer.id, app.binding)).webdock_role, "reader");
  const settings = (await database.query("SELECT settings FROM webdock_auth.platform_settings WHERE id=true")).rows[0];
  try {
    await database.query(`INSERT INTO webdock_auth.platform_settings(id,settings) VALUES(true,'{"cmsEnabled":false}') ON CONFLICT(id) DO UPDATE SET settings=webdock_auth.platform_settings.settings || '{"cmsEnabled":false}'::jsonb`);
    assert.equal((await currentClaims(customer.id, app.binding)).webdock_role, "reader", "Portal membership is independent from the CMS switch");
  } finally {
    if (settings) await database.query("UPDATE webdock_auth.platform_settings SET settings=$1 WHERE id=true", [settings.settings]);
    else await database.query("DELETE FROM webdock_auth.platform_settings WHERE id=true");
  }
  await database.query('UPDATE webdock_auth."oauthClient" SET disabled=true WHERE "clientId"=$1', [app.clientID]);
  assert.equal((await currentClaims(customer.id, app.binding)).disabled, true);
  await database.query('UPDATE webdock_auth."oauthClient" SET disabled=false WHERE "clientId"=$1', [app.clientID]);
  const verifier = randomBytes(32).toString("base64url");
  const query = new URLSearchParams({ client_id: app.clientID, redirect_uri: "http://127.0.0.1:3120/api/sso/callback", response_type: "code", scope: "openid profile email", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state: "fixture-state", nonce: randomBytes(18).toString("hex") });
  const authorization = await auth.handler(new Request(origin + "/api/auth/oauth2/authorize?" + query, { headers: customer.headers }));
  assert.equal(authorization.status, 302);
  const code = new URL(authorization.headers.get("location")!).searchParams.get("code");
  assert.ok(code);
  const basic = "Basic " + Buffer.from(`${app.clientID}:${app.clientSecret}`).toString("base64");
  const tokenResponse = await auth.handler(new Request(origin + "/api/auth/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: app.clientID, client_secret: app.clientSecret, redirect_uri: "http://127.0.0.1:3120/api/sso/callback", code, code_verifier: verifier }) }));
  assert.equal(tokenResponse.status, 200);
  const tokens = await tokenResponse.json();
  let nativeDetails: Record<string, unknown> = {}, nativeStatus = 0;
  const proof = await handleStudioRequest(request("session", [], tokens.access_token, basic), { introspect: async incoming => {
    const reply = await auth.handler(incoming);
    const details = await reply.clone().json();
    nativeStatus = reply.status; nativeDetails = details;
    return reply;
  } });
  assert.equal(nativeStatus, 200, JSON.stringify({ error: nativeDetails.error, error_description: nativeDetails.error_description }));
  assert.equal(nativeDetails.active, true);
  assert.equal(nativeDetails.sid, customer.session.id);
  assert.equal(nativeDetails.client_id, app.clientID);
  assert.equal(proof.status, 200);
  assert.equal((await handleStudioRequest(request("session", [], tokens.access_token))).status, 401);
  assert.equal((await handleStudioRequest(request("session", [], "invalid", basic))).status, 401);
  assert.equal((await handleStudioRequest(request("session", [], tokens.access_token, "Basic " + Buffer.from(`different:${app.clientSecret}`).toString("base64")))).status, 401);
  await database.query(`UPDATE webdock_auth.session SET "expiresAt"=now()-interval '1 second' WHERE id=$1`, [customer.session.id]);
  assert.equal((await handleStudioRequest(request("session", [], tokens.access_token, basic))).status, 401);
  await database.query(`UPDATE webdock_auth.session SET "expiresAt"=now()+interval '1 hour' WHERE id=$1`, [customer.session.id]);
  await database.query('UPDATE webdock_admin.customers SET status=\'archived\' WHERE id=$1', [tenant.id]);
  assert.equal((await currentClaims(customer.id, app.binding)).disabled, true);
  assert.equal((await handleStudioRequest(request("session", [], tokens.access_token, basic))).status, 401);
});

test("Studio preserves safe validation and delegates native organization creation and tenant invitations", async () => {
  const operator = await identity(true), customer = await identity();
  const app = await registerApplication({ label: "Studio native writes fixture", origin: "http://127.0.0.1:3120", logoutPath: "/login", headers: operator.headers });
  process.env.WEBDOCK_STUDIO_CLIENT_ID = app.clientID;
  const tenants = (await database.query("INSERT INTO webdock_admin.customers(id,name) VALUES(webdock_auth.next_snowflake(),'Studio invitations one'),(webdock_auth.next_snowflake(),'Studio invitations two') RETURNING id")).rows;
  const org = (await database.query('SELECT organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$1', [tenants[0].id])).rows[0].organization_id;
  await database.query('INSERT INTO webdock_auth.member("organizationId","userId",role,"createdAt") VALUES($1,$2,\'admin\',now())', [org, customer.id]);
  const basic = "Basic " + Buffer.from(`${app.clientID}:${app.clientSecret}`).toString("base64");
  async function accessToken(headers: Headers) {
    const verifier = randomBytes(32).toString("base64url");
    const query = new URLSearchParams({ client_id: app.clientID, redirect_uri: "http://127.0.0.1:3120/api/sso/callback", response_type: "code", scope: "openid profile email", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state: "fixture-state", nonce: randomBytes(18).toString("hex") });
    const authorization = await auth.handler(new Request(origin + "/api/auth/oauth2/authorize?" + query, { headers }));
    assert.equal(authorization.status, 302);
    const code = new URL(authorization.headers.get("location")!).searchParams.get("code");
    assert.ok(code);
    const response = await auth.handler(new Request(origin + "/api/auth/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: app.clientID, client_secret: app.clientSecret, redirect_uri: "http://127.0.0.1:3120/api/sso/callback", code, code_verifier: verifier }) }));
    assert.equal(response.status, 200);
    return (await response.json()).access_token as string;
  }
  const rootToken = await accessToken(operator.headers), customerToken = await accessToken(customer.headers);
  for (const error of [new Error("private-database-credential"), new APIError("FORBIDDEN", { message: "private-native-credential" })]) {
    const hidden = await handleStudioRequest(request("session", [], rootToken, basic), { introspect: async () => { throw error; } });
    assert.equal((await hidden.text()).includes("private-"), false, "Unknown and native errors remain sanitized");
  }
  let response = await handleStudioRequest(request("managePlans", [{ action: "create-plan", name: "Invalid allowance", storageMB: "-1" }], rootToken, basic));
  assert.equal(response.status, 400);
  assert.deepEqual((await response.json()).error, { kind: "PlanError", message: "Allowances must be nonnegative numbers within the supported range." });
  response = await handleStudioRequest(request("manageAccess", [{ action: "create-organization", name: "Native Studio organization" }], rootToken, basic));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  const createdOrg = (await response.json()).data.id;
  assert.equal((await database.query('SELECT name FROM webdock_auth.organization WHERE id=$1', [createdOrg])).rows[0].name, "Native Studio organization");
  const email = `bridge-invite-${randomBytes(8).toString("hex")}@example.invalid`;
  response = await handleStudioRequest(request("manageTenant", [tenants[0].id, { action: "invite", email, name: "Invited through Studio", role: "member" }], customerToken, basic));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal(response.headers.get("set-cookie"), null);
  const invitation = (await database.query('SELECT id,"organizationId","inviterId",status FROM webdock_auth.invitation WHERE email=$1', [email])).rows[0];
  assert.equal(invitation.organizationId, org);
  assert.equal(invitation.inviterId, customer.id);
  assert.equal(invitation.status, "pending");
  const { testOutbox } = await import("../src/lib/mail");
  assert.ok(testOutbox.some(mail => mail.to === email && mail.text.includes("reset-password")));
  assert.equal((await database.query('SELECT m.id FROM webdock_auth.member m JOIN webdock_auth."user" u ON u.id=m."userId" WHERE u.email=$1', [email])).rowCount, 0, "An invitation never grants membership before acceptance");
  const unauthorizedEmail = `blocked-${randomBytes(8).toString("hex")}@example.invalid`;
  response = await handleStudioRequest(request("manageTenant", [tenants[1].id, { action: "invite", email: unauthorizedEmail, name: "Blocked", role: "admin" }], customerToken, basic));
  assert.equal(response.status, 403);
  assert.equal((await database.query('SELECT id FROM webdock_auth.invitation WHERE email=$1', [unauthorizedEmail])).rowCount, 0);
  assert.equal(testOutbox.some(mail => mail.to === unauthorizedEmail), false);
});
