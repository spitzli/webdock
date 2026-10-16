import { createBillingSubscriptions } from "@webdock/module-billing/server/subscriptions";
import { installationRegistry } from "../../installation";
import { databasePools } from "../../db/runtime";
import { customerTransaction, billingAudit } from "./context";
import { versionSchema } from "./checkout";
import { billingWorkerProvider } from "./worker-provider";

export const {
  changeDirection,
  quoteSubscriptionChange,
  changeSubscription,
  resumeSubscriptionChange,
} = createBillingSubscriptions({
  databasePools,
  customerTransaction,
  billingAudit,
  versionSchema,
  billingWorkerProvider,
  requireBilling: (intent) => installationRegistry().require("billing", intent),
});
