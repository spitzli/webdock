import test from "node:test";
import assert from "node:assert/strict";
import { resumeIntegrationCallback } from "./integration-resume";
const input = {
  apiOrigin: "https://api.example.test",
  uiOrigin: "https://studio.example.test",
  consoleOrigin: "https://console.example.test",
  bearerToken: "fresh.signed.token",
  cookie:
    "__Host-webdock-integration-resume=encrypted-handoff; __Host-webdock-github-flow=signed-state; __session=expired.token; webdock-sso=legacy; webdock-auth.session_token=private",
};
test("Console resumes only through fixed API endpoint with fresh proof and allowlisted state, without following provider redirects", async () => {
  const result = await resumeIntegrationCallback(
    input,
    async (url, options) => {
      assert.equal(
        String(url),
        "https://api.example.test/v1/integrations/resume",
      );
      assert.equal(options?.method, "POST");
      assert.equal(options?.redirect, "manual");
      const headers = new Headers(options?.headers);
      assert.equal(headers.get("authorization"), "Bearer fresh.signed.token");
      assert.equal(
        headers.get("cookie"),
        "__Host-webdock-github-flow=signed-state; __Host-webdock-integration-resume=encrypted-handoff",
      );
      const responseHeaders = new Headers({
        location: "https://studio.example.test/integrations?github=connected",
      });
      responseHeaders.append(
        "set-cookie",
        "__Host-webdock-github=encrypted-session; Path=/; Secure; HttpOnly",
      );
      responseHeaders.append(
        "set-cookie",
        "webdock-auth.session_token=must-not-escape",
      );
      return new Response(null, { status: 303, headers: responseHeaders });
    },
  );
  assert.equal(result.status, 303);
  assert.equal(
    result.headers.get("location"),
    "https://console.example.test/integrations?github=connected",
  );
  assert.match(result.headers.get("set-cookie") ?? "", /encrypted-session/);
  assert.doesNotMatch(
    result.headers.get("set-cookie") ?? "",
    /must-not-escape/,
  );
  assert.match(result.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal(result.headers.get("referrer-policy"), "no-referrer");
});
test("missing fresh proof, revoked mappings and external redirects end the refresh without another navigation", async () => {
  let calls = 0;
  const noProof = await resumeIntegrationCallback(
    { ...input, bearerToken: null },
    async () => {
      calls++;
      throw Error();
    },
  );
  assert.equal(noProof.status, 401);
  assert.equal(calls, 0);
  for (const providerResponse of [
    new Response(null, { status: 401 }),
    new Response(null, {
      status: 303,
      headers: { location: "https://evil.invalid/" },
    }),
  ]) {
    const result = await resumeIntegrationCallback(
      input,
      async () => providerResponse,
    );
    assert.ok(result.status >= 400);
    assert.equal(result.headers.get("location"), null);
    assert.match(result.headers.get("set-cookie") ?? "", /Max-Age=0/);
  }
});
