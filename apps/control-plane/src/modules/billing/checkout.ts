import { createBillingCheckout } from "@webdock/module-billing/server/checkout";
import { installationRegistry } from "../../installation";
import { databasePools } from "../../db/runtime";
import { customerTransaction, billingAudit } from "./context";
import { billingWorkerProvider } from "./worker-provider";
import { openBilling, sealBilling } from "./crypto";

export const {
  versionSchema,
  quotePurchase,
  storedCheckoutTerms,
  createCheckout,
} = createBillingCheckout({
  databasePools,
  customerTransaction,
  billingAudit,
  billingWorkerProvider,
  openBilling,
  sealBilling,
  studioOriginSetting: () => process.env.WEBDOCK_STUDIO_ORIGIN,
  production: () => process.env.NODE_ENV === "production",
  requireBilling: (intent) => installationRegistry().require("billing", intent),
});
