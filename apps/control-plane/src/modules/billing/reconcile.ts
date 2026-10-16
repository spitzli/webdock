import { createBillingReconcile } from "@webdock/module-billing/server/reconcile";
import { databasePools } from "../../db/runtime";
import { billingWorkerProvider } from "./worker-provider";
import { storedCheckoutTerms, versionSchema } from "./checkout";
import { sealBilling } from "./crypto";

export const { reconcileCustomer } = createBillingReconcile({
  databasePools,
  billingWorkerProvider,
  storedCheckoutTerms,
  versionSchema,
  sealBilling,
});
