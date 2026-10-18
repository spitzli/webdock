import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeSignedCookie } from "better-call";
import { createBetterAuthRuntime } from "./runtime";
import { cookiePolicy, signCompatibilitySession } from "./compatibility";
for (const baseURL of ["https://identity.example", "http://localhost:3125"]) {
  test(`internal Clerk bridge cookie matches provider protocol at ${baseURL}`, async () => {
    const secret = "compatibility-fixture-secret-at-least-32-characters";
    const runtime = createBetterAuthRuntime(() => ({ baseURL, secret, advanced: cookiePolicy(baseURL) }));
    const context = await runtime.$context;
    assert.equal(await signCompatibilitySession(baseURL, secret, "fixture-token"),
      (await serializeSignedCookie(context.authCookies.sessionToken.name, "fixture-token", context.secret)).split(";")[0]);
    await assert.rejects(signCompatibilitySession(baseURL, "", "fixture-token"));
  });
}
