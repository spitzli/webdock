import { test } from "node:test";
import assert from "node:assert/strict";
import { createStorageUsage, StorageUsageError } from "../src/server/usage.ts";
import type { StoragePorts } from "../src/server/ports.ts";
function ports(overrides: Partial<StoragePorts> = {}): StoragePorts {
  return {
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
