import { createBillingWebhooks } from "@webdock/module-billing/server/webhooks";
import { verifyPolarWebhook } from "@webdock/adapter-billing-polar";
import { databasePools } from "../../db/runtime";
import { openBilling, sealBilling } from "./crypto";

export const { receiveWebhook } = createBillingWebhooks({
  databasePools,
  openBilling,
  sealBilling,
  verifyProviderWebhook: verifyPolarWebhook,
});
