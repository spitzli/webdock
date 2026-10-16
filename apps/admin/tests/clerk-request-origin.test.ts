import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createClerkRequest } from "@clerk/backend/internal";
import { canonicalClerkRequest } from "../src/lib/clerk-request-origin";

test("Clerk handshake uses configured public origin and preserves path, cookies and POST body", async () => {
  const request = new NextRequest("https://deployment.vercel.app/login?returnTo=%2Ftenants", {
    method: "POST", body: "action=example",
    headers: {"x-forwarded-host": "deployment.vercel.app", "x-forwarded-proto": "https", cookie: "fixture=value", origin: "https://untrusted.example"},
  });
  const normalized = canonicalClerkRequest(request, "https://console.webdock.dev");
  assert.equal(createClerkRequest(normalized).clerkUrl.href, "https://console.webdock.dev/login?returnTo=%2Ftenants");
  assert.equal(normalized.nextUrl.origin, "https://console.webdock.dev");
  assert.equal(normalized.headers.get("origin"), "https://untrusted.example", "preserve original Origin for CSRF checks");
  assert.equal(normalized.cookies.get("fixture")?.value, "value");
  assert.equal(await normalized.text(), "action=example");
});

test("request-supplied forwarded origins cannot choose the handshake destination", () => {
  const request = new NextRequest("https://deployment.vercel.app/", {headers: {"x-forwarded-host": "attacker.example", "x-forwarded-proto": "http"}});
  assert.equal(createClerkRequest(canonicalClerkRequest(request, "https://console.webdock.dev")).clerkUrl.origin, "https://console.webdock.dev");
  assert.throws(() => canonicalClerkRequest(request, "http://console.webdock.dev"));
});

test("network-path references cannot escape the configured origin", () => {
  const request = new NextRequest("https://deployment.vercel.app//attacker.example/login");
  assert.throws(() => canonicalClerkRequest(request, "https://console.webdock.dev"), /Ambiguous/);
});
