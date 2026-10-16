import { createBillingView } from "@webdock/module-billing/server/view";
import { customerTransaction, customerReadTransaction } from "./context";
import { createCheckout } from "./checkout";

export const { tenantBilling, resumeCheckout } = createBillingView({
  customerTransaction,
  customerReadTransaction,
  createCheckout,
  studioOriginSetting: () => process.env.WEBDOCK_STUDIO_ORIGIN,
});
