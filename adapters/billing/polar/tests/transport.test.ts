import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { billingPolar, verifyPolarWebhook } from "../src/index";
import { createHostedPolarClient } from "../src/hosted";
test("official webhook verification rejects tampering and preserves verified unknown events for quarantine", async () => {
  const secret = "fixture-polar-webhook-secret-at-least-32",
    id = randomUUID(),
    timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    type: "future.unknown",
    api_version: "2026-10",
    timestamp: new Date().toISOString(),
    data: { id: randomUUID() },
  });
  const headers = {
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature":
      "v1," +
      createHmac("sha256", secret)
        .update(id + "." + timestamp + "." + body)
        .digest("base64"),
  };
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("External network forbidden");
  };
  try {
    const result = await verifyPolarWebhook(body, headers, secret);
    assert.equal(result.kind, "verified");
    if (result.kind === "verified")
      assert.deepEqual(result.payload, JSON.parse(body));
    assert.equal(
      (await verifyPolarWebhook(body + " ", headers, secret)).kind,
      "invalid-signature",
    );
    assert.equal(
      (
        await verifyPolarWebhook(
          body,
          headers,
          "different-fixture-key-at-least-32-chars",
        )
      ).kind,
      "invalid-signature",
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("provider environment/token validation happens before any request and hosted clients remain explicit", async () => {
  assert.throws(() => billingPolar("live", ""));
  assert.throws(() => billingPolar("invalid" as "live", "fixture-token"));
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (input) => {
    requests++;
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, "https://sandbox-api.polar.sh");
    return Response.json({
      items: [],
      pagination: { total_count: 0, max_page: 1 },
    });
  };
  try {
    const client = billingPolar("sandbox", "fixture-token");
    assert.equal(requests, 0);
    await client.organizations.list({ limit: 1 });
    assert.equal(requests, 1);
    const hosted = createHostedPolarClient(() => ({
      server: "sandbox",
      accessToken: "fixture-token",
    }));
    assert.equal(hosted(), hosted());
    assert.throws(() =>
      createHostedPolarClient(() => ({
        server: "sandbox",
        accessToken: undefined,
      }))(),
    );
  } finally {
    globalThis.fetch = original;
  }
});
