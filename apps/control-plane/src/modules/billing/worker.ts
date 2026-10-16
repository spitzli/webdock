import { createBillingWorker } from "@webdock/module-billing/server/worker";
import { databasePools } from "../../db/runtime";
import {
  billingDispatcher,
  claimBillingJob,
  renewBillingJob,
  completeBillingJob,
  failBillingJob,
} from "./jobs";
import { reconcileCustomer } from "./reconcile";
import { reconcileCatalog } from "./catalog-reconcile";
import { dispatchWebhook } from "./dispatch";

export const { billingWorkerEnvironments, runBillingBatch } =
  createBillingWorker({
    databasePools,
    billingDispatcher,
    claimBillingJob,
    renewBillingJob,
    completeBillingJob,
    failBillingJob,
    reconcileCustomer,
    reconcileCatalog,
    dispatchWebhook,
  });
