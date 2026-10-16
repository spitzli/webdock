import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTabularisLaunch,
  tabularisCapabilities,
  tabularisSessionEndpoint,
} from "./launch";
const target = {
  kind: "customer-binding" as const,
  bindingID: "123",
  projectID: "234",
  customerID: "345",
};
const launch = {
  code: "a".repeat(43),
  gatewayOrigin: "https://gateway.example",
  binding: {
    id: "123",
    projectID: "234",
    customerID: "345",
    name: "Database",
    environment: "production",
    engine: "postgresql",
    profile: "read",
  },
  expiresAt: "2030-01-01T00:00:00.000Z",
};
test("public launch requires exact binding/customer/project and rejects confidential runtime input", () => {
  assert.equal(
    resolveTabularisLaunch(launch, target, 0).capabilities.readonly,
    true,
  );
  assert.throws(() =>
    resolveTabularisLaunch(launch, { ...target, customerID: "999" }, 0),
  );
  assert.throws(() =>
    resolveTabularisLaunch(
      { ...launch, database: { password: "secret" } },
      target,
      0,
    ),
  );
  assert.throws(() =>
    resolveTabularisLaunch(launch, target, Date.parse("2031-01-01")),
  );
});
test("platform and customer identities stay distinct; operator defaults remain read-only", () => {
  const platform = { kind: "platform" as const, key: "metadata" as const };
  assert.equal(tabularisCapabilities(platform).readonly, true);
  assert.throws(() => tabularisCapabilities(platform, "schema"));
  assert.throws(() => resolveTabularisLaunch(launch, platform, 0));
});
test("session handshake cannot redirect native UI transport to a different origin or scope", () => {
  const session = {
    scopeID: "session-123",
    connectionID: "opaque",
    baseUrl: "https://gateway.example/s/session-123",
  };
  assert.deepEqual(
    tabularisSessionEndpoint(session, launch.gatewayOrigin),
    session,
  );
  assert.throws(() =>
    tabularisSessionEndpoint(
      { ...session, baseUrl: "https://other.example/s/session-123" },
      launch.gatewayOrigin,
    ),
  );
  assert.throws(() =>
    tabularisSessionEndpoint(
      { ...session, scopeID: "../escape" },
      launch.gatewayOrigin,
    ),
  );
});
