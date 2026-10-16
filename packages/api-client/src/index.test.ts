import test from "node:test";
import assert from "node:assert/strict";
import { requestAPI } from "./index";
test("API transport forwards only Webdock session cookies and fixed-origin metadata", async () => {
  const response = await requestAPI(
    {
      apiOrigin: "https://api.webdock.dev",
      uiOrigin: "https://studio.webdock.dev",
      cookie:
        "other=secret; __Host-webdock-sso=opaque; provider_token=do-not-forward",
      path: "/v1/studio",
      body: { operation: "session", args: [] },
    },
    async (input, init) => {
      assert.equal(String(input), "https://api.webdock.dev/v1/studio");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("cookie"), "__Host-webdock-sso=opaque");
      assert.equal(headers.get("origin"), "https://studio.webdock.dev");
      assert.equal(headers.get("authorization"), null);
      assert.equal(init?.redirect, "error");
      return Response.json({ data: { operator: false } });
    },
  );
  assert.deepEqual(response, {
    status: 200,
    body: { data: { operator: false } },
  });
});
test("transport rejects credentials, external paths and oversized streamed responses", async () => {
  const base = {
    apiOrigin: "https://api.webdock.dev",
    uiOrigin: "https://studio.webdock.dev",
    cookie: "",
    path: "/v1/studio",
    body: {},
  };
  for (const value of [
    { apiOrigin: "https://user:pass@api.webdock.dev" },
    { path: "//evil.invalid" },
    { path: "https://evil.invalid" },
  ])
    await assert.rejects(requestAPI({ ...base, ...value }));
  await assert.rejects(
    requestAPI(
      base,
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(2_000_001));
              controller.close();
            },
          }),
        ),
    ),
    /oversized/,
  );
});
test("transport rejects malformed response envelopes before UI callers use them", async () => {
  for (const value of [null, [], "unavailable", 42]) {
    await assert.rejects(
      requestAPI(
        {
          apiOrigin: "https://api.webdock.dev",
          uiOrigin: "https://studio.webdock.dev",
          cookie: "",
          path: "/v1/studio",
        },
        async () => Response.json(value),
      ),
      /response envelope/,
    );
  }
});

test("selected Clerk bearer goes only to trusted Studio and never alongside legacy cookies", async () => {
  const input = {
    apiOrigin: "https://api.webdock.dev",
    uiOrigin: "https://studio.webdock.dev",
    cookie:
      "__Host-webdock-sso=old; __session=provider; webdock-auth.session_token=native; __Host-webdock-github=encrypted-session; webdock-github-flow=signed-state; webdock-git-flow=git-state; webdock-vercel-flow=vercel-state; webdock-byok-vercel=byok-state; arbitrary=secret",
    bearerToken: "signed.clerk.token",
    path: "/v1/studio",
    body: { operation: "session", args: [] },
  };
  await requestAPI(input, async (url, init) => {
    assert.equal(String(url), "https://api.webdock.dev/v1/studio");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer signed.clerk.token");
    assert.equal(
      headers.get("cookie"),
      "__Host-webdock-github=encrypted-session; webdock-github-flow=signed-state; webdock-git-flow=git-state; webdock-vercel-flow=vercel-state; webdock-byok-vercel=byok-state",
    );
    assert.equal(init?.redirect, "error");
    return Response.json({ data: null });
  });
  for (const path of [
    "/v1/auth/session",
    "/v1/public/config",
    "https://evil.invalid/",
    "//evil.invalid",
  ]) {
    await assert.rejects(
      requestAPI({ ...input, path }, async () => {
        throw Error("must not send");
      }),
    );
  }
});
