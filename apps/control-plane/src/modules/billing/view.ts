import { createBillingView } from "@webdock/module-billing/server/view";
import { customerTransaction } from "./context";
import { createCheckout } from "./checkout";

export const { tenantBilling, resumeCheckout } = createBillingView({
  customerTransaction,
  createCheckout,
  studioOriginSetting: () => process.env.WEBDOCK_STUDIO_ORIGIN,
});
