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
    const { audience, ...nativeBase } = config;
    const nativeConfig = { ...nativeBase, tokenMode: "session" as const };
    const nativeBody = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: config.issuer, sub: "user_test", sid: "sess_test", azp: config.authorizedParties[0], iat: now, nbf: now, exp: now + 60 })}`;
    const nativeToken =
      nativeBody +
      "." +
      sign("RSA-SHA256", Buffer.from(nativeBody), privateKey).toString(
        "base64url",
      );
    assert.equal(
      (await backend.verifyToken(nativeToken, nativeConfig)).sub,
      "user_test",
    );
    await assert.rejects(backend.verifyToken(nativeToken, config));
    await assert.rejects(
      backend.verifyToken(nativeToken, {
        ...nativeConfig,
        issuer: "https://other.example",
      }),
    );
    await assert.rejects(
      backend.verifyToken(nativeToken, {
        ...nativeConfig,
        authorizedParties: ["https://other.example"],
      }),
    );
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

test("Backend SDK grants operator only from current private metadata", async () => {
  const originalFetch = globalThis.fetch;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  let metadata: Record<string, unknown> = {};
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        object: "user",
        id: "user_test",
        banned: false,
        locked: false,
        two_factor_enabled: true,
        email_addresses: [],
        ...metadata,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  try {
    const backend = createClerkBackend("sk_test_unit_fixture");
    for (const [value, expected] of [
      [{}, "user"],
      [
        {
          public_metadata: { webdockRole: "operator" },
          unsafe_metadata: { webdockRole: "operator" },
        },
        "user",
      ],
      [{ private_metadata: { webdockRole: "org:admin" } }, "user"],
      [{ private_metadata: { webdockRole: "operator" } }, "operator"],
      [{ private_metadata: { webdockRole: "user" } }, "user"],
    ] as const) {
      metadata = value;
      assert.equal((await backend.user("user_test")).role, expected);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("Backend membership reads page through exact organizations and observe revocation", async () => {
  const originalFetch = globalThis.fetch;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  let revoked = false;
  const urls: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    urls.push(url);
    const secondPage = url.searchParams.get("offset") === "100";
    const member = (organizationID: string) => ({
      object: "organization_membership",
      id: "mem_" + organizationID,
      organization: { object: "organization", id: organizationID },
      public_user_data: { user_id: "user_test" },
      role: "org:deployer",
      permissions: ["org:projects:manage"],
    });
    return new Response(
      JSON.stringify({
        data: revoked
          ? []
          : secondPage
            ? [member("org_target")]
            : Array.from({ length: 100 }, (_, i) => member("org_other" + i)),
        total_count: revoked ? 0 : 101,
      }),
      { headers: { "content-type": "application/json" } },
    );
  };
  try {
    const backend = createClerkBackend("sk_test_unit_fixture");
    assert.deepEqual(await backend.membership("org_target", "user_test"), {
      id: "mem_org_target",
      organizationID: "org_target",
      subject: "user_test",
      role: "org:deployer",
      permissions: ["org:projects:manage"],
    });
    assert.equal(urls[1].searchParams.get("offset"), "100");
    assert.equal(
      urls[0].pathname,
      "/v1/users/user_test/organization_memberships",
    );
    revoked = true;
    assert.equal(await backend.membership("org_target", "user_test"), null);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});
