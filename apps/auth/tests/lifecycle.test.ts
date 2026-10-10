import test from "node:test";
import assert from "node:assert/strict";
import { auth } from "../src/lib/auth";
import { database } from "../src/lib/db";
import { lifecycle } from "../src/lib/lifecycle";
import { randomBytes } from "node:crypto";
import { createIdentity, registerApplication } from "../src/lib/bootstrap";
import { mcpResource } from "../src/lib/mcp";

const local = new URL(process.env.DATABASE_URL!);
if (!["localhost", "127.0.0.1"].includes(local.hostname) || local.pathname !== "/webdock_admin_test") throw Error("Disposable local test database required.");
test.after(async () => { await auth.$context; await database.end(); });

test("lifecycle authenticates, binds its preview, isolates deletion and proves retries", async t => {
  await auth.$context;
  process.env.WEBDOCK_STUDIO_CLIENT_ID = "123";
  let token = { active: true, sub: "operator", sid: "session", exp: Date.now() / 1000 + 300, client_id: "123", aud: mcpResource, scope: "webdock:read webdock:write" };
  let role = "operator", activeSession = true, preview = false, mcp = true, introspectionOK = true;
  let row: Record<string, unknown> | undefined = { id: "456", client_id: "789", organization_id: "888", customer_id: "999", label: "Demo", metadata: { webdock_binding: "456" }, redirectUris: ["https://demo.example/api/sso/callback"] };
  const original = { ...row };
  const events = new Set<string>();
  const statements: string[] = [];
  let failDelete = false, managedHosting = false;
  t.mock.method(auth, "handler", async (request: Request) => {
    const body = new URLSearchParams(await request.text());
    assert.equal(body.get("client_id"), "123");
    assert.equal(body.get("client_secret"), "secret");
    return Response.json(token, { status: introspectionOK ? 200 : 401 });
  });
  t.mock.method(database, "query", async (sql: string) => {
    if (sql.includes('SELECT role,banned')) return { rows: [{ role, emailVerified: true, twoFactorEnabled: true }] };
    if (sql.includes('SELECT metadata')) return { rows: [{ metadata: { webdock_mcp: mcp } }] };
    throw Error("Unexpected pool query");
  });
  t.mock.method(database, "connect", async () => ({
    release() {},
    async query(sql: string, values: unknown[] = []) {
      statements.push(sql);
      if (sql.startsWith('SELECT s.id')) return { rows: activeSession ? [{ id: "session" }] : [] };
      if (sql.startsWith('SELECT session_id')) return { rows: preview ? [{}] : [] };
      if (sql.startsWith('SELECT project_id FROM webdock_auth.hosting_project')) return {rows:managedHosting?[{project_id:'222'}]:[]};
      if (sql.startsWith('SELECT customer_id,url FROM webdock_admin.projects')) return {rows:[{customer_id:'999',url:'https://demo.example'}]};
      if (sql.startsWith('SELECT b.id')) return { rows: row ? [row] : [] };
      if (sql.startsWith('SELECT id FROM webdock_auth.access_event')) return { rows: events.has(String(values[0])) ? [{}] : [] };
      if (sql.startsWith('INSERT INTO webdock_auth.access_event')) events.add(String(values[1]));
      if (sql.startsWith('DELETE') && failDelete) throw Error("database unavailable");
      return { rows: [] };
    },
  }));
  const call = (changes = {}, authorization = "Basic " + Buffer.from("123:secret").toString("base64")) => lifecycle(new Request("http://localhost/api/lifecycle", { method: "POST", headers: { authorization }, body: JSON.stringify({ accessToken: "opaque", operation: "preview", bindingID: "456", customerID: "999", origin: "https://demo.example", ...changes }) }));
  managedHosting=true;
  assert.equal((await call({projectID:'222'})).status,409);
  assert.equal((await call()).status,409,'older clients cannot bypass managed-hosting protection');
  assert.equal(statements.some(sql=>sql.startsWith('DELETE')),false);
  managedHosting=false;
  assert.equal((await call({}, "Bearer invalid")).status, 401);
  introspectionOK = false; assert.equal((await call()).status, 401); introspectionOK = true;
  role = "admin"; assert.equal((await call()).status, 403); role = "operator";
  activeSession = false; assert.equal((await call()).status, 403); activeSession = true;
  preview = true; assert.equal((await call()).status, 403); preview = false;
  token = { ...token, client_id: "mcp", scope: "webdock:read" };
  assert.equal((await call()).status, 200);
  assert.equal((await call({ operation: "delete", planHash: "0".repeat(64) })).status, 403);
  statements.length = 0;
  assert.equal((await call({ requireWrite: true })).status, 403);
  assert.equal(statements.length, 0, "Write authorization fails before opening a transaction");
  token.scope += " webdock:write"; mcp = false; assert.equal((await call()).status, 403); mcp = true;
  token.aud = "https://wrong.example"; assert.equal((await call()).status, 403); token.aud = mcpResource;
  assert.equal((await call({ customerID: "111" })).status, 409);
  assert.equal((await call({ origin: "https://other.example" })).status, 409);
  row = { ...original, client_id: "123" }; assert.equal((await call()).status, 409);
  row = { ...original, redirectUris: ["https://auth.webdock.dev/api/sso/callback"] }; assert.equal((await call({ origin: "https://auth.webdock.dev" })).status, 409);
  row = { ...original, redirectUris: ["https://demo.example/api/sso/callback", "https://other.example/api/sso/callback"] }; assert.equal((await call()).status, 409);
  row = { ...original };
  const plan = await (await call()).json();
  assert.match(plan.planHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(plan).includes("secret"), false);
  assert.equal((await call({ operation: "delete" })).status, 400);
  row.label = "Changed"; assert.equal((await (await call()).json()).planHash, plan.planHash); row.label = original.label;
  row.organization_id = "887"; assert.equal((await call({ operation: "delete", planHash: plan.planHash })).status, 409); row.organization_id = original.organization_id;
  failDelete = true;
  assert.equal((await call({ operation: "delete", planHash: plan.planHash })).status, 500);
  assert.equal(statements.at(-1), "ROLLBACK");
  assert.equal(events.size, 0);
  failDelete = false; statements.length = 0;
  assert.equal((await call({ operation: "delete", planHash: plan.planHash })).status, 200);
  assert.equal(statements.at(-1), "COMMIT");
  assert.equal(statements.filter(sql => sql.startsWith("DELETE")).length, 6);
  assert.equal(statements.some(sql => /DELETE FROM.*(?:organization|tenant_customer|\."user")/.test(sql)), false);
  row = undefined;
  assert.equal((await call()).status, 404);
  assert.equal((await call({ operation: "delete", planHash: "0".repeat(64) })).status, 404);
  assert.equal((await call({ operation: "delete", customerID: "111", planHash: plan.planHash })).status, 404);
  assert.equal((await (await call({ operation: "delete", planHash: plan.planHash })).json()).alreadyRemoved, true);
});


test("lifecycle deletes only a bound website in the disposable PostgreSQL database", async t => {
  const password = randomBytes(24).toString("base64url");
  const user = await createIdentity({ email: `lifecycle-${randomBytes(8).toString("hex")}@example.invalid`, name: "Lifecycle fixture", password, operator: true, mustChangePassword: false });
  const response = await auth.api.signInEmail({ body: { email: user.email, password }, asResponse: true });
  assert.equal(response.status, 200);
  const headers = new Headers({ Origin: process.env.BETTER_AUTH_URL!, Cookie: response.headers.getSetCookie().map(c => c.split(";")[0]).join("; ") });
  const session = await auth.api.getSession({ headers }); assert.ok(session);
  await database.query('UPDATE webdock_auth."user" SET "twoFactorEnabled"=true WHERE id=$1', [user.id]);
  const studio = await registerApplication({ label: "Lifecycle Studio", origin: "http://127.0.0.1:3120", logoutPath: "/login", headers });
  process.env.WEBDOCK_STUDIO_CLIENT_ID = studio.clientID;
  const customer = (await database.query("INSERT INTO webdock_admin.customers(id,name) VALUES(webdock_auth.next_snowflake(),'Lifecycle disposable tenant') RETURNING id")).rows[0];
  const organization = (await database.query("SELECT organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$1", [customer.id])).rows[0].organization_id;
  const site = await registerApplication({ label: "Lifecycle site", origin: "https://lifecycle.example", logoutPath: "/admin/login", organizationID: organization, headers });
  const other = await registerApplication({ label: "Lifecycle other", origin: "https://other.example", logoutPath: "/admin/login", organizationID: organization, headers });
  await database.query("INSERT INTO webdock_auth.project_grant(user_id,binding_id,organization_id,role) VALUES($1,$2,$3,'admin')", [user.id, site.binding, organization]);
  t.mock.method(auth, "handler", async () => Response.json({ active: true, sub: user.id, sid: session.session.id, exp: Date.now() / 1000 + 300, client_id: studio.clientID }));
  const call = (operation: string, planHash?: string) => lifecycle(new Request("http://localhost/api/lifecycle", { method: "POST", headers: { authorization: "Basic " + Buffer.from(`${studio.clientID}:fixture-secret`).toString("base64") }, body: JSON.stringify({ accessToken: "fixture-token", operation, bindingID: site.binding, customerID: customer.id, origin: "https://lifecycle.example", planHash }) }));
  const preview = await call("preview"); assert.equal(preview.status, 200);
  const plan = await preview.json();
  const removed = await call("delete", plan.planHash); assert.equal(removed.status, 200);
  assert.equal((await database.query("SELECT id FROM webdock_auth.app_binding WHERE id=$1", [site.binding])).rowCount, 0);
  assert.equal((await database.query('SELECT id FROM webdock_auth."oauthClient" WHERE "clientId"=$1', [site.clientID])).rowCount, 0);
  assert.equal((await database.query("SELECT id FROM webdock_auth.project_grant WHERE binding_id=$1", [site.binding])).rowCount, 0);
  assert.equal((await database.query("SELECT id FROM webdock_auth.app_binding WHERE id=$1", [other.binding])).rowCount, 1);
  assert.equal((await database.query("SELECT customer_id FROM webdock_auth.tenant_customer WHERE customer_id=$1", [customer.id])).rowCount, 1);
  assert.equal((await database.query('SELECT id FROM webdock_auth."user" WHERE id=$1', [user.id])).rowCount, 1);
  assert.equal((await (await call("delete", plan.planHash)).json()).alreadyRemoved, true);
});
