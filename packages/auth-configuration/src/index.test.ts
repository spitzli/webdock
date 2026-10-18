import assert from "node:assert/strict";
import { test } from "node:test";
import { readAuthProviderConfiguration } from "./index";
const native = {
  provider: "clerk",
  issuer: "https://identity.example",
  tokenMode: "session",
};
test("explicit development loopback accepts exact browser origins only", () => {
  for (const origin of [
    "http://localhost:3460",
    "http://127.0.0.1:3460",
    "http://[::1]:3460",
  ]) {
    const configuration = {
      ...native,
      authorizedParties: [origin],
      allowLocalHTTP: true,
    };
    assert.deepEqual(
      readAuthProviderConfiguration(
        JSON.stringify(configuration),
        "development",
      ),
      configuration,
    );
    assert.throws(() =>
      readAuthProviderConfiguration(
        JSON.stringify({ ...configuration, allowLocalHTTP: false }),
        "development",
      ),
    );
    assert.throws(() =>
      readAuthProviderConfiguration(
        JSON.stringify({ ...native, authorizedParties: [origin] }),
        "development",
      ),
    );
    assert.throws(
      () =>
        readAuthProviderConfiguration(
          JSON.stringify(configuration),
          "production",
        ),
      /production/,
    );
  }
  for (const origin of [
    "http://example.com",
    "http://localhost.evil.test",
    "http://localhost:3460/path",
    "http://user@localhost:3460",
    "http://localhost:3460#fragment",
  ]) {
    assert.throws(() =>
      readAuthProviderConfiguration(
        JSON.stringify({
          ...native,
          authorizedParties: [origin],
          allowLocalHTTP: true,
        }),
        "development",
      ),
    );
  }
});
test("local HTTP option cannot relax issuer or audience and is forbidden in production", () => {
  const configuration = {
    ...native,
    authorizedParties: ["https://console.example"],
    allowLocalHTTP: true,
  };
  assert.throws(
    () =>
      readAuthProviderConfiguration(
        JSON.stringify(configuration),
        "production",
      ),
    /production/,
  );
  assert.throws(() =>
    readAuthProviderConfiguration(
      JSON.stringify({ ...configuration, issuer: "http://localhost:3460" }),
      "development",
    ),
  );
  assert.throws(
    () =>
      readAuthProviderConfiguration(
        JSON.stringify({ ...configuration, tokenMode: undefined }),
        "development",
      ),
    /audience/,
  );
  assert.throws(() =>
    readAuthProviderConfiguration(
      JSON.stringify({ ...configuration, audience: "ambiguous" }),
      "development",
    ),
  );
  for (const value of ["true", 1, null])
    assert.throws(() =>
      readAuthProviderConfiguration(
        JSON.stringify({ ...configuration, allowLocalHTTP: value }),
        "development",
      ),
    );
});
