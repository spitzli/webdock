import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket, WebSocketServer } from "ws";
import type { ManagedRuntimeAccess } from "@webdock/database-contracts";
import { createGateway } from "../src/server";
import type { ManagedRuntimeManager } from "../src/managed-runtimes";

async function fixture(options: { enabled?: boolean; ttl?: number; incompatible?: boolean } = {}) {
  let revision = "revision-1", revoked = false, starts = 0, stops = 0;
  const upstream = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/v1/session") {
      assert.equal(req.headers.origin, "https://127.0.0.1:12345");
      res.setHeader("Set-Cookie", "tabularis_session=private-cookie; HttpOnly");
      res.end(JSON.stringify({ apiVersion: options.incompatible ? "v2" : "v1", authenticated: true, csrfToken: "csrf", capabilities: {}, queryResponsePolicy: {} }));
    } else if (req.url?.includes("get_connections")) res.end(JSON.stringify({ ok: true, data: [{ id: "123", name: "tenant", params: { driver: "postgres", database: "tenant", host: "private-host", password: "private-password" } }] }));
    else res.end(JSON.stringify({ ok: false, error: { message: "private-password private-host" } }));
  });
  const events = new WebSocketServer({ server: upstream });
  events.on("connection", client => client.send(JSON.stringify({ type: "event", payload: { connectionId: "123" } })));
  upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
  const upstreamAddress = upstream.address(); assert.ok(upstreamAddress && typeof upstreamAddress !== "string");
  const active = new Set<string>();
  const manager: ManagedRuntimeManager = {
    async acquire(id, access) {
      if (!active.has(id)) { starts++; active.add(id); }
      return { scopeID: access.scopeID, subject: access.subject, connectionID: access.connectionID, profile: access.profile, expiresAt: access.expiresAt,
        runtimeOrigin: `http://127.0.0.1:${upstreamAddress.port}`, authenticationOrigin: "https://127.0.0.1:12345", proxySecret: "private-secret" };
    },
    async release(id) { if (active.delete(id)) stops++; },
    async shutdown() { stops += active.size; active.clear(); },
  };
  const expiresAt = new Date(Date.now() + (options.ttl ?? 60_000)).toISOString();
  const access = (): ManagedRuntimeAccess => ({ kind: "managed", scopeID: "123", subject: "alice", connectionID: "123", profile: "schema", revision, expiresAt,
    database: { host: "private-host", port: 5432, database: "tenant", username: "owner", password: "private-password", caCertificate: "private-ca" } });
  const gateway = createGateway({ publicOrigin: "http://localhost:3137", allowedOrigins: ["http://localhost:3120"], runtimeOrigins: [],
    ...(options.enabled === false ? {} : { managedRuntimes: manager }),
    control: async body => {
      if (revoked) throw Error("private-password");
      if (body.action === "exchange") return { token: "t".repeat(43), scopeID: "123", expiresAt };
      return access();
    },
  });
  gateway.listen(0, "127.0.0.1"); await once(gateway, "listening");
  const address = gateway.address(); assert.ok(address && typeof address !== "string");
  let cookie = "";
  const call = (path: string, method = "GET", body?: unknown) => fetch(`http://127.0.0.1:${address.port}` + path, { method,
    headers: { Origin: "http://localhost:3120", Cookie: cookie, "Content-Type": "application/json", "X-Tabularis-Csrf": "csrf" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    call, starts: () => starts, stops: () => stops, rotate: () => { revision = "revision-2"; }, revoke: () => { revoked = true; },
    async launch() { const response = await call("/session", "POST", { code: "x".repeat(43) }); cookie = response.headers.get("set-cookie")?.split(";")[0] ?? ""; return response; },
    async openEvents() { const client = new WebSocket(`ws://127.0.0.1:${address.port}/s/123/api/v1/events`, { headers: { Origin: "http://localhost:3120", Cookie: cookie } }); await once(client, "message"); return client; },
    async close() { await gateway.shutdown(); for (const client of events.clients) client.terminate(); events.close(); upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); },
  };
}

test("managed gateway opens without remote allowlist, redacts credentials and cleans up logout", async () => {
  const f = await fixture();
  try {
    const launch = await f.launch(); assert.equal(launch.status, 200); assert.ok(!JSON.stringify(await launch.json()).includes("private"));
    const session = await f.call("/s/123/api/v1/session"); assert.equal(session.status, 200);
    const rows = await f.call("/s/123/api/v1/rpc/get_connections", "POST", null); assert.equal(rows.status, 200);
    assert.deepEqual((await rows.json()).data, [{ id: "123", name: "tenant", params: { driver: "postgres", database: "tenant" } }]);
    const error = await f.call("/s/123/api/v1/rpc/execute_query", "POST", { connectionId: "123", query: "select 1" });
    assert.ok(!JSON.stringify(await error.json()).includes("private"));
    assert.equal(f.starts(), 1);
    const events = await f.openEvents(); const closed = once(events, "close");
    assert.equal((await f.call("/s/123/api/v1/logout", "POST")).status, 200); assert.equal(f.stops(), 1);
    assert.equal((await closed)[0], 1008);
  } finally { await f.close(); }
});

test("managed sessions fail closed on changed revision and never silently retarget", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.launch()).status, 200);
    assert.equal((await f.call("/s/123/api/v1/session")).status, 200);
    f.rotate(); assert.equal((await f.call("/s/123/api/v1/session")).status, 401);
    assert.equal(f.starts(), 1); assert.equal(f.stops(), 1);
    assert.equal((await f.call("/s/123/api/v1/session")).status, 401);
  } finally { await f.close(); }
});

test("managed sessions clean up while idle on expiry and authorization revocation", async () => {
  const expiry = await fixture({ ttl: 200 });
  try { assert.equal((await expiry.launch()).status, 200); await new Promise(resolve => setTimeout(resolve, 250)); assert.equal(expiry.stops(), 1); }
  finally { await expiry.close(); }
  const revoked = await fixture();
  try {
    assert.equal((await revoked.launch()).status, 200); revoked.revoke();
    await new Promise(resolve => setTimeout(resolve, 3200)); assert.equal(revoked.stops(), 1);
  } finally { await revoked.close(); }
});

test("managed runtime is opt-in and incompatible negotiation releases its process", async () => {
  const disabled = await fixture({ enabled: false });
  try { assert.equal((await disabled.launch()).status, 503); assert.equal(disabled.starts(), 0); } finally { await disabled.close(); }
  const incompatible = await fixture({ incompatible: true });
  try {
    assert.equal((await incompatible.launch()).status, 200);
    assert.equal((await incompatible.call("/s/123/api/v1/session")).status, 502); assert.equal(incompatible.stops(), 1);
  } finally { await incompatible.close(); }
});
