import { createBillingCatalogReconcile } from "@webdock/module-billing/server/catalog-reconcile";
import { databasePools } from "../../db/runtime";
import { billingWorkerProvider } from "./worker-provider";

export const { reconcileCatalog } = createBillingCatalogReconcile({
  databasePools,
  billingWorkerProvider,
});
