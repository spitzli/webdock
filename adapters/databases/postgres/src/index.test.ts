import { test } from "node:test";
import assert from "node:assert/strict";
import { createDatabases, createWorkerDatabases, databaseURL } from "./index";
test("PostgreSQL URL boundary rejects parameter injection and non-database schemes", () => {
  for (const raw of [
    "https://example/db",
    "postgres://user@host/db?host=other",
    "postgres://user@host/db#fragment",
    "postgres://user@host/",
  ])
    assert.throws(() => databaseURL(raw));
  assert.equal(
    databaseURL("postgres://user@host/db?sslmode=verify-full").pathname,
    "/db",
  );
});
test("production refuses owner, shared, loopback or unsigned connections before opening pools", () => {
  const config = {
    environment: "production" as const,
    businessURL: "postgres://webdock_auth_runtime@db.example/webdock",
    authURL: "postgres://webdock_auth_bootstrap@db.example/webdock",
    workerURL: "postgres://webdock_worker_runtime@db.example/webdock",
    signingSecret: "unit-signing-key-that-is-longer-than-32-bytes",
    max: 1,
  };
  for (const change of [
    { businessURL: "postgres://postgres@db.example/webdock" },
    { signingSecret: undefined },
    { max: 0 },
    { authURL: config.businessURL },
    { businessURL: "postgres://webdock_auth_runtime@127.0.0.1/webdock" },
  ])
    assert.throws(() => createDatabases({ ...config, ...change }));
  assert.throws(() =>
    createWorkerDatabases({ ...config, workerURL: config.authURL }),
  );
});
test("worker constructor exposes only its single restricted pool and never creates auth pool", async () => {
  const pools = createWorkerDatabases({
    environment: "test",
    workerURL: "postgres://fixture@127.0.0.1:1/webdock_api_test",
    max: 1,
  });
  try {
    assert.equal(pools.business, pools.worker);
    assert.equal(pools.authentication, pools.worker);
    assert.equal(pools.orm, pools.workerOrm);
  } finally {
    await pools.close();
  }
});
