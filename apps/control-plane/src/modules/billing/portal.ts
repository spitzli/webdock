import { createBillingPortal } from "@webdock/module-billing/server/portal";
import { customerTransaction } from "./context";
import { billingWorkerProvider } from "./worker-provider";

export const { createCustomerPortal } = createBillingPortal({
  customerTransaction,
  billingWorkerProvider,
  studioOriginSetting: () => process.env.WEBDOCK_STUDIO_ORIGIN,
});
