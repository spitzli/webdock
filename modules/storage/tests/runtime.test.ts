import { test } from "node:test";
import assert from "node:assert/strict";
import { createStorageUsage, StorageUsageError } from "../src/server/usage.ts";
import type { StoragePorts } from "../src/server/ports.ts";
function ports(overrides: Partial<StoragePorts> = {}): StoragePorts {
  return {
    identity: { session: async () => null, subject: async () => null, membership: async () => null },
    database: {
      query: async () => ({ rows: [], rowCount: 0 }),
      connect: async () => {
        throw Error("No transaction expected");
      },
    } as unknown as StoragePorts["database"],
    withAuthenticatedDatabase: async (_headers, run) => run(),
    getTenant: async () => ({ operator: false, tenant: { status: "active" } }),
    resolveSessionReference: async () => ({ subject: "123", sessionID: "456" }),
    requireStorage: () => {},
    encryptSecret: () => {
      throw Error("No secrets expected");
    },
    decryptSecret: () => {
      throw Error("No secrets expected");
    },
    validateStoreToken: () => {
      throw Error("No provider expected");
    },
    measureStorage: async () => {
      throw Error("No provider expected");
    },
    ...overrides,
  };
}
test("disabled storage denies access and worker work before reading or calling a provider", async () => {
  const runtime = createStorageUsage(
    ports({
      requireStorage: () => {
        throw Error("disabled");
      },
    }),
  );
  await assert.rejects(
    runtime.getTenantStorage(new Headers(), "123"),
    /disabled/,
  );
  await assert.rejects(runtime.refreshStorageBatch(), /disabled/);
});
test("draining blocks adding mappings, while an empty admitted batch needs no provider credentials", async () => {
  const runtime = createStorageUsage(
    ports({
      requireStorage: (intent) => {
        if (intent === "provision") throw Error("draining");
      },
    }),
  );
  await assert.rejects(
    runtime.manageTenantStorage(new Headers(), "123", { action: "add" }),
    /draining/,
  );
  assert.deepEqual(await runtime.refreshStorageBatch(), {
    attempted: 0,
    succeeded: 0,
    failed: 0,
  });
});
test("tenant membership cannot replace operator authority on storage mappings", async () => {
  const runtime = createStorageUsage(ports());
  await assert.rejects(
    runtime.manageTenantStorage(new Headers(), "123", {
      action: "refresh",
      storageID: "456",
    }),
    StorageUsageError,
  );
  const view = await runtime.getTenantStorage(new Headers(), "123");
  assert.deepEqual(view, {
    stores: [],
    productionBytes: null,
    previewBytes: null,
  });
});

test("storage mutation rechecks provider operator authority inside its transaction", async () => {
  let operator = true, removed = false;
  const identity = {
    subject: "123", role: "operator", banned: false, emailVerified: true,
    mustChangePassword: false, twoFactorEnabled: false, operatorAuthorized: true,
  };
  const connection = {
    release() {},
    async query(sql: string) {
      if (sql.includes('FROM webdock_auth."user"')) return { rows: [] };
      if (sql.includes("FROM webdock_admin.customers")) return { rows: [{ id: "customer" }] };
      if (sql.startsWith("DELETE")) removed = true;
      return { rows: [], rowCount: 1 };
    },
  };
  const runtime = createStorageUsage(ports({
    getTenant: async () => ({ operator: true, tenant: { status: "active" } }),
    identity: {
      session: async () => ({ ...identity, role: operator ? "operator" : "user", operatorAuthorized: operator, sessionID: "456", preview: false }),
      subject: async () => identity,
      membership: async () => null,
    },
    database: {
      query: async () => ({ rows: [{ id: "storage", revision: 1 }], rowCount: 1 }),
      connect: async () => connection,
    } as unknown as StoragePorts["database"],
  }));
  await runtime.manageTenantStorage(new Headers(), "customer", { action: "remove", storageID: "storage" });
  assert.equal(removed, true);
  operator = false;
  removed = false;
  await assert.rejects(runtime.manageTenantStorage(new Headers(), "customer", { action: "remove", storageID: "storage" }), StorageUsageError);
  assert.equal(removed, false);
});
