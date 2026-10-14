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
