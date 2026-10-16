import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createClerkBackend } from "./sdk";
test("official SDK verifies local RSA signature and rejects altered signatures without network", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const now = Math.floor(Date.now() / 1000);
  const config = {
    provider: "clerk" as const,
    issuer: "https://identity.example",
    audience: "webdock",
    authorizedParties: ["https://console.example"],
  };
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: config.issuer, sub: "user_test", sid: "sess_test", azp: config.authorizedParties[0], aud: config.audience, iat: now, nbf: now, exp: now + 60 })}`;
  const token =
    body +
    "." +
    sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url");
  const backend = createClerkBackend(
    "sk_test_unit_fixture",
    publicKey.export({ type: "spki", format: "pem" }).toString(),
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("External network forbidden in signature test");
  };
  try {
    assert.equal((await backend.verifyToken(token, config)).sub, "user_test");
    const changed =
      token.slice(0, token.lastIndexOf(".") + 1) + "invalid-signature";
    await assert.rejects(backend.verifyToken(changed, config));
    await assert.rejects(
      backend.verifyToken(token, { ...config, audience: "other" }),
    );
    await assert.rejects(
      backend.verifyToken(token, {
        ...config,
        authorizedParties: ["https://other.example"],
      }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
