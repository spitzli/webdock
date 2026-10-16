import { createBillingWorkerProvider } from "@webdock/module-billing/server/worker-provider";
import { databasePools } from "../../db/runtime";
import { openBilling } from "./crypto";
import { billingPolar } from "./polar";

export const { billingWorkerProvider } = createBillingWorkerProvider({
  databasePools,
  openBilling,
  billingPolar,
});
