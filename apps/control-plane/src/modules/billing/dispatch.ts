import { createBillingDispatch } from "@webdock/module-billing/server/dispatch";
import { databasePools } from "../../db/runtime";
import { openBilling } from "./crypto";
import { billingDispatcher } from "./jobs";
import { billingWorkerProvider } from "./worker-provider";

export const { dispatchWebhook } = createBillingDispatch({
  databasePools,
  openBilling,
  billingDispatcher,
  billingWorkerProvider,
});
