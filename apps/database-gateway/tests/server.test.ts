import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket, WebSocketServer } from "ws";
import { createGateway } from "../src/server";

test("gateway authenticates each RPC, strips credentials and stops revoked sessions", async () => {
  let nextInspectionDelay = 0;
  let storedDriver = "postgres";
  let revoked = false, lastHeaders: Record<string, unknown> = {};
  const audit: unknown[] = [];
  let lastBody: unknown;
  const upstream = createServer(async (req, res) => {
    lastHeaders = req.headers;
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/v1/session") {
      res.setHeader("Set-Cookie", "tabularis_session=upstream-private; HttpOnly");
      return res.end(JSON.stringify({ apiVersion: "v1", authenticated: true, csrfToken: "upstream-csrf", capabilities: {}, queryResponsePolicy: {} }));
    }
    let raw = ""; for await (const chunk of req) raw += chunk;
    lastBody = raw ? JSON.parse(raw) : null;
    setTimeout(() => res.end(JSON.stringify({ ok: true, data: [{ id: "internal", name: "Orders", params: { driver: storedDriver, database: "orders", password: "never-expose" } }] })), 25);
  });
  const upstreamEvents = new WebSocketServer({ server: upstream });
  upstreamEvents.on("connection", client => client.send(JSON.stringify({ type: "event", event: "query-progress", payload: { connectionId: "internal" }, sequence: 1 })));
  upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
  const address = upstream.address(); assert.ok(address && typeof address !== "string");
  const upstreamOrigin = `http://127.0.0.1:${address.port}`;
  const gateway = createGateway({ publicOrigin: "http://127.0.0.1:55442", allowedOrigins: ["http://localhost:3120"], runtimeOrigins: [upstreamOrigin],
    audit: event => audit.push(event),
    control: async body => {
      const delay = nextInspectionDelay; nextInspectionDelay = 0;
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (revoked) throw Error("revoked");
      if (body.action === "exchange") return { token: "t".repeat(43), scopeID: "123", expiresAt: new Date(Date.now()+60000).toISOString() };
      return { scopeID: "123", subject: "alice", connectionID: "internal", profile: "read", runtimeOrigin: upstreamOrigin, proxySecret: "trusted-secret", expiresAt: new Date(Date.now()+60000).toISOString() };
    },
  });
  gateway.listen(55442, "127.0.0.1"); await once(gateway, "listening");
  const call = (path: string, init?: RequestInit) => fetch("http://127.0.0.1:55442"+path, { ...init, headers: { Origin: "http://localhost:3120", ...init?.headers } });
  try {
    const exchange = await call("/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "x".repeat(43) }) });
    assert.equal(exchange.status, 200);
    const cookie = exchange.headers.get("set-cookie")!.split(";")[0];
    assert.ok(exchange.headers.get("set-cookie")!.includes("Path=/s/123/"));
    const launch = await exchange.json();
    assert.equal(launch.connectionID, "123");
    assert.ok(!JSON.stringify(launch).includes("trusted-secret"));
    const session = await call("/s/123/api/v1/session", { headers: { Cookie: cookie } });
    assert.equal(session.status, 200);
    const sessionData = await session.json();
    const events = new WebSocket("ws://127.0.0.1:55442/s/123/api/v1/events", { headers: { Origin: "http://localhost:3120", Cookie: cookie } });
    const [event] = await once(events, "message");
    assert.equal(JSON.parse(event.toString()).payload.connectionId, "123");
    const upstreamClient = [...upstreamEvents.clients][0];
    const collectTwo = (socket: WebSocket) => new Promise<unknown[]>((resolve, reject) => {
      const messages: unknown[] = [];
      const timeout = setTimeout(() => { socket.off("message", receive); reject(Error("Missing ordered frames")); }, 2000);
      const receive = (data: import("ws").RawData) => {
        messages.push(JSON.parse(data.toString()));
        if (messages.length === 2) { clearTimeout(timeout); socket.off("message", receive); resolve(messages); }
      };
      socket.on("message", receive);
    });
    const receivedEvents = collectTwo(events);
    nextInspectionDelay = 50;
    upstreamClient.send(JSON.stringify({ type: "event", sequence: 2 }));
    upstreamClient.send(JSON.stringify({ type: "event", sequence: 3 }));
    assert.deepEqual((await receivedEvents).map(value => (value as { sequence: number }).sequence), [2, 3], "Authorization latency must not reorder events");
    const receivedCommands = collectTwo(upstreamClient);
    nextInspectionDelay = 50;
    events.send(JSON.stringify({ type: "subscribe", event: "query-progress" }));
    events.send(JSON.stringify({ type: "unsubscribe", event: "query-progress" }));
    assert.deepEqual((await receivedCommands).map(value => (value as { type: string }).type), ["subscribe", "unsubscribe"], "Authorization latency must not reorder subscription commands");
    const overloaded = new WebSocket("ws://127.0.0.1:55442/s/123/api/v1/events", { headers: { Origin: "http://localhost:3120", Cookie: cookie } });
    await once(overloaded, "message");
    const floodSource = [...upstreamEvents.clients].find(client => client !== upstreamClient)!;
    const overflowClosed = once(overloaded, "close");
    nextInspectionDelay = 50;
    for (let sequence = 2; sequence <= 131; sequence++) floodSource.send(JSON.stringify({ type: "event", sequence }));
    assert.equal((await overflowClosed)[0], 1008, "Authorization queues must remain bounded");
    const rpc = (command: string, body: unknown) => call("/s/123/api/v1/rpc/"+command, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "X-Tabularis-Csrf": sessionData.csrfToken, "X-Tabularis-User": "attacker" }, body: JSON.stringify(body) });
    const rows = await rpc("get_connections", null);
    assert.equal(rows.status, 200);
    assert.equal((await rows.json()).data[0].id, "123");
    assert.equal(lastHeaders["x-tabularis-user"], "alice");
    assert.equal(lastHeaders["x-tabularis-proxy-secret"], "trusted-secret");
    storedDriver = "sqlite";
    assert.equal((await rpc("test_connection", { request: { connection_id: "123", params: { database: "/etc/passwd" } } })).status, 200, "SQLite uses only the registered runtime connection");
    assert.deepEqual(lastBody, { request: { connection_id: "internal", params: { driver: "sqlite", database: "orders", password: "never-expose" } } });
    storedDriver = "postgres";
    const initialReads = await Promise.all(Array.from({ length: 12 }, () => rpc("get_connections", null)));
    assert.ok(initialReads.every(response => response.status === 200), "Workspace bootstrap metadata must fit the concurrency limit");
    assert.equal((await rpc("save_connection", {})).status, 403);
    assert.equal((await rpc("execute_query", { connectionId: "other", query: "select 1" })).status, 403);
    assert.equal((await call("/s/999/api/v1/session", { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await call("/s/123/api/v1/session", { headers: { Cookie: "tabularis_session=upstream-private" } })).status, 401);
    const inFlight = rpc("get_connections", null);
    await new Promise(resolve => setTimeout(resolve, 10));
    revoked = true;
    assert.equal((await inFlight).status, 401, "Revoked access must not release an in-flight result");
    const closed = once(events, "close");
    for (const client of upstreamEvents.clients) client.send(JSON.stringify({ type: "event", payload: { connectionId: "internal" }, sequence: 2 }));
    await closed;
    assert.equal((await rpc("get_connections", null)).status, 401);
    assert.ok(audit.length > 0);
    assert.ok(!JSON.stringify(audit).includes("trusted-secret"));
    assert.ok(!JSON.stringify(audit).includes("select 1"));
  } finally { for (const client of upstreamEvents.clients) client.terminate(); upstreamEvents.close(); upstream.closeAllConnections(); await Promise.all([gateway.shutdown(), new Promise<void>(r => upstream.close(() => r()))]); }
});
