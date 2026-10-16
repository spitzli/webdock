import { test, expect } from "bun:test";
const enabled = process.env.WEBDOCK_RLS_FIXTURE_FILE;
(enabled ? test : test.skip)(
  "an unconfigured billing environment has no catalog work and requires no provider credentials",
  async () => {
    const { databasePools } = await import("../src/db/runtime");
    try {
      const { reconcileCatalog } =
        await import("../src/modules/billing/catalog-reconcile");
      await expect(reconcileCatalog("live")).resolves.toBeUndefined();
      await expect(reconcileCatalog("sandbox")).resolves.toBeUndefined();
    } finally {
      await databasePools.close();
    }
  },
);
