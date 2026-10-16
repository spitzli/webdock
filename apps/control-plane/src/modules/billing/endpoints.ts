import { createBillingEndpoints } from "@webdock/module-billing/server/endpoints";
import { operatorTransaction, billingAudit } from "./context";
import { billingPolar } from "./polar";
import { sealBilling, openBilling } from "./crypto";
import { connectionStatus } from "./connection";

export const { webhookURL, setupEndpoint } = createBillingEndpoints({
  operatorTransaction,
  billingAudit,
  billingPolar,
  sealBilling,
  openBilling,
  connectionStatus,
  apiOriginSetting: () => process.env.WEBDOCK_API_ORIGIN,
});
