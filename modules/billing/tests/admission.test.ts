import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, ModuleError } from "@webdock/module-sdk";
import { billingManifest } from "../src/manifest";
import { createBillingCatalog } from "../src/server/catalog";
import { createBillingOffers } from "../src/server/offers";
import type { PlatformDatabaseRuntime } from "@webdock/platform-db/types";
test("draining/disabled admission refuses direct catalog publication, new versions and offers before I/O", async () => {
  for (const state of ["draining", "disabled"] as const) {
    let io = 0;
    const operations: string[] = [];
    const registry = createRegistry([billingManifest], {
      configVersion: 1,
      modules: { billing: { state } },
    });
    const requireOperation = (operation: string) => {
      operations.push(operation);
      registry.require("billing", "provision");
    };
    const reject = () => {
      io++;
      throw Error("Unexpected external or database access");
    };
    const catalog = createBillingCatalog({
      requireOperation,
      operatorTransaction: async () => reject(),
      billingAudit: async () => reject(),
      openBilling: () => reject(),
      billingPolar: () => reject(),
    });
    const offers = createBillingOffers({
      requireOperation,
      databasePools: { orm: {} as PlatformDatabaseRuntime["orm"] },
      operatorTransaction: async () => reject(),
      customerTransaction: async () => reject(),
      billingAudit: async () => reject(),
      studioOriginSetting: () => reject(),
    });
    const actor = { subject: "123", sessionID: "session" };
    for (const operation of [
      () => catalog.createProductVersion(actor, {}),
      () => catalog.publishProduct(actor, {}),
      () => offers.createOffer(actor, {}),
    ])
      await assert.rejects(
        operation(),
        (error: unknown) => error instanceof ModuleError,
      );
    assert.deepEqual(operations, [
      "billing.createVersion",
      "billing.publish",
      "billing.createOffer",
    ]);
    assert.equal(io, 0);
    // Existing management is not classified as new provisioning by these ports.
    operations.length = 0;
    await assert.rejects(catalog.archiveProduct(actor, {}));
    await assert.rejects(offers.revokeOffer(actor, {}));
    assert.deepEqual(operations, []);
  }
});
