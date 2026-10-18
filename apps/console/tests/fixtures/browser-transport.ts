import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const mode = process.argv[2];
delete process.env.WEBDOCK_AUTH_PROVIDER;
delete process.env.WEBDOCK_CONSOLE_AUTH_PROVIDER;
delete process.env.WEBDOCK_CONSOLE_SERVICE_KEY;
process.env.WEBDOCK_API_ORIGIN = "https://api.example.test";
process.env.NEXT_PUBLIC_SERVER_URL = "https://console.example.test";
if (mode === "adapter") {
  process.env.WEBDOCK_AUTH_PROVIDER = JSON.stringify({
    provider: "clerk",
    issuer: "https://clerk.example.test",
    authorizedParties: ["https://console.example.test"],
    audience: "webdock",
  });
  process.env.WEBDOCK_CONSOLE_SERVICE_KEY = "s".repeat(32);
  // Explicit selected Clerk uses the authenticated Console boundary.
  process.env.WEBDOCK_CONSOLE_AUTH_PROVIDER = "clerk";
} else if (mode === "console") {
  process.env.WEBDOCK_CONSOLE_AUTH_PROVIDER = "clerk";
  process.env.WEBDOCK_CONSOLE_SERVICE_KEY = "s".repeat(32);
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    const source =
      specifier === "server-only"
        ? "export {};"
        : specifier === "next/headers"
          ? 'export async function headers() { return new Headers({cookie: "webdock-sso=stale; webdock-github=integration"}); }'
          : specifier === "@clerk/nextjs/server"
            ? 'let sequence=0; export async function auth() { return { userId:"user_fixture", getToken:async()=>"fresh-token-"+(++sequence) }; }'
            : specifier === "next/navigation"
              ? 'export function redirect() { throw Error("unexpected redirect"); }'
              : null;
    return source
      ? {
          url: `data:text/javascript,${encodeURIComponent(source)}`,
          shortCircuit: true,
        }
      : nextResolve(specifier, context);
  },
});
const { studioCall } = await import("../../src/lib/studio-client");
const sent: { path: string; headers: Headers }[] = [];
globalThis.fetch = async (url, init) => {
  sent.push({
    path: new URL(String(url)).pathname,
    headers: new Headers(init?.headers),
  });
  return Response.json({ data: { ok: true } });
};
await studioCall("session");
await studioCall("session");
assert.equal(sent.length, 2);
for (const [index, request] of sent.entries()) {
  assert.equal(request.path, mode !== "legacy" ? "/v1/console" : "/v1/studio");
  assert.equal(
    request.headers.get("authorization"),
    mode === "legacy" ? null : `Bearer fresh-token-${index + 1}`,
  );
  assert.equal(
    request.headers.get("x-webdock-service-key"),
    mode !== "legacy" ? "s".repeat(32) : null,
  );
  assert.equal(
    request.headers.get("cookie"),
    mode !== "legacy"
      ? ""
      : "webdock-sso=stale; webdock-github=integration",
  );
}
