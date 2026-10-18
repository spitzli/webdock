import { test } from "node:test";
import assert from "node:assert/strict";
import { createPluginHTTP, type HTTPBinding } from "./plugin-http";
const binding: HTTPBinding = {
  origin: "https://moon.example.com",
  addresses: ["203.0.113.2"],
  headers: { authorization: "Bearer host-only" },
  rules: [
    {
      method: "GET",
      path: "/api/websites/owned/stats",
      query: ["startAt", "endAt"],
    },
    { method: "POST", path: "/api/websites", query: [] },
  ],
};
const request = new Request("https://host/v1/plugin/http", { method: "POST" });
const fixture = () => {
  const sent: any[] = [];
  let revoked = false;
  const service = createPluginHTTP(
    {
      authorize: async () => {
        if (revoked) throw Error("revoked");
        return binding;
      },
    },
    async (input) => {
      sent.push(input);
      return { status: 200, body: { ok: true } };
    },
  );
  return {
    service,
    sent,
    revoke: () => {
      revoked = true;
    },
  };
};
test("uses the host-owned binding and headers", async () => {
  const f = fixture();
  assert.deepEqual(
    await f.service.request(request, {
      binding: "analytics",
      method: "GET",
      path: "/api/websites/owned/stats?startAt=1&endAt=2",
    }),
    { status: 200, body: { ok: true } },
  );
  assert.equal(f.sent[0].headers.authorization, "Bearer host-only");
  assert.equal(f.sent[0].url.origin, binding.origin);
});
test("rejects arbitrary destinations, traversal, foreign IDs, query and credential injection", async () => {
  for (const path of [
    "https://evil.test/api/websites",
    "//evil.test/api/websites",
    "/api/../api/websites",
    "/api/%2e%2e/api/websites",
    "/api/websites/foreign/stats",
    "/api/websites/owned/stats?url=https://evil.test",
    "/api/websites/owned/stats?startAt=1&startAt=2",
    "/api/websites/owned/stats#x",
  ]) {
    const f = fixture();
    await assert.rejects(() =>
      f.service.request(request, { binding: "analytics", method: "GET", path }),
    );
    assert.equal(f.sent.length, 0);
  }
  const f = fixture();
  await assert.rejects(() =>
    f.service.request(request, {
      binding: "analytics",
      method: "GET",
      path: "/api/websites/owned/stats",
      headers: { authorization: "x" },
    }),
  );
});
test("checks revocation before and after upstream I/O", async () => {
  const f = fixture();
  f.revoke();
  await assert.rejects(() =>
    f.service.request(request, {
      binding: "analytics",
      method: "GET",
      path: "/api/websites/owned/stats",
    }),
  );
  assert.equal(f.sent.length, 0);
  let checks = 0;
  const service = createPluginHTTP(
    {
      authorize: async () => {
        if (++checks > 1) throw Error("revoked");
        return binding;
      },
    },
    async () => ({ status: 200, body: { secret: "result" } }),
  );
  await assert.rejects(() =>
    service.request(request, {
      binding: "analytics",
      method: "GET",
      path: "/api/websites/owned/stats",
    }),
  );
});
test("never follows redirects or returns provider authentication responses", async () => {
  for (const status of [301, 302, 307, 308, 401, 403]) {
    const service = createPluginHTTP(
      { authorize: async () => binding },
      async () => ({ status, body: { token: "secret" } }),
    );
    await assert.rejects(() =>
      service.request(request, {
        binding: "analytics",
        method: "POST",
        path: "/api/websites",
        body: { name: "test" },
      }),
    );
  }
});
test("rejects unbounded payload and insecure bindings", async () => {
  const f = fixture();
  await assert.rejects(() =>
    f.service.request(request, {
      binding: "analytics",
      method: "POST",
      path: "/api/websites",
      body: { data: "x".repeat(1048577) },
    }),
  );
  for (const origin of [
    "http://moon.example.com",
    "https://user:pass@moon.example.com",
    "https://moon.example.com/base",
  ]) {
    const s = createPluginHTTP(
      { authorize: async () => ({ ...binding, origin }) },
      async () => {
        throw Error("should not call");
      },
    );
    await assert.rejects(() =>
      s.request(request, {
        binding: "analytics",
        method: "POST",
        path: "/api/websites",
      }),
    );
  }
});
