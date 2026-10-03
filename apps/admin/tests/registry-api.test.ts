import test from "node:test";
import assert from "node:assert/strict";
import type { Payload } from "payload";
import { handleRegistryRequest } from "../src/lib/registry-api";

const user = { id: "123", collection: "users", role: "operator" };
test("Registry HTTP API uses bearer scopes, validates requests, and preserves audited writes", async () => {
  const writes: Record<string, unknown>[] = [];
  const payload = {
    find: async (args: { collection: string }) => args.collection === "users" ? { docs: [user] } : { docs: [{ id: "456", name: "Example" }], totalDocs: 1, totalPages: 1, page: 1 },
    create: async (args: Record<string, unknown>) => { writes.push(args); return { id: "456", ...(args.data as object) }; },
    update: async (args: Record<string, unknown>) => { writes.push(args); return { id: args.id, ...(args.data as object) }; },
    findByID: async () => ({ id: "456", name: "Example" }),
  } as unknown as Payload;
  const dependencies = { getCMS: async () => payload, authenticate: async (request: Request) => {
    const token = request.headers.get("authorization");
    return token?.startsWith("Bearer ") ? { subject: "123", scopes: new Set(token.includes("write") ? ["webdock:read", "webdock:write"] : ["webdock:read"]) } : null;
  } };
  const call = (path: string[], method = "GET", token = "read", body?: unknown, headers: Record<string, string> = {}) => handleRegistryRequest(new Request("http://localhost:3120/api/registry/" + path.join("/"), { method, headers: { ...(token ? { Authorization: "Bearer " + token } : {}), "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), path, dependencies);
  assert.equal((await call(["customers"], "GET", "", undefined, { Cookie: "payload-token=fake" })).status, 401);
  assert.equal((await call(["customers"], "POST", "read", { name: "Denied" })).status, 403);
  assert.equal((await call(["customers"], "POST", "write", { name: "Denied" }, { Origin: "https://attacker.invalid" })).status, 403);
  assert.equal(writes.length, 0);
  assert.equal((await call(["users"])).status, 400);
  assert.equal((await call(["customers", "1e20"])).status, 400);
  assert.equal((await call(["customers"], "POST", "write", { name: "Test", role: "operator" })).status, 400);
  assert.equal((await call(["customers"], "POST", "write", { name: "Test" }, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await call(["customers"], "POST", "write", { name: "x".repeat(70000) })).status, 413);
  const created = await call(["customers"], "POST", "write", { name: "Test" });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).id, "456");
  assert.equal(created.headers.get("cache-control"), "no-store");
  assert.equal(writes[0].overrideAccess, false);
  assert.equal((writes[0].user as typeof user).id, "123");
  assert.equal((await call(["customers", "456"], "PUT", "write", { name: "Changed" })).status, 200);
  assert.equal((await call(["customers", "456"], "PATCH", "write", { archived: true })).status, 200);
  assert.deepEqual(writes[2].data, { status: "archived" });
  assert.equal((await call(["audit-events"], "POST", "write", { summary: "Fake" })).status, 405);
  assert.equal((await call(["customers", "456"], "DELETE", "write")).status, 405);
  assert.equal((await call(["customers"])).status, 200);
  assert.equal((await call(["customers", "456"])).status, 200);
  const catalog = await (await call([])).json();
  assert.ok(catalog.schemas.customer.properties.name);
});
