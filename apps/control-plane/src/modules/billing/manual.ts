import { createBillingManual } from "@webdock/module-billing/server/manual";
import { operatorTransaction, billingAudit } from "./context";
import { billingWorkerProvider } from "./worker-provider";

export const { releaseToManual, operatorCustomerBilling } = createBillingManual(
  { operatorTransaction, billingAudit, billingWorkerProvider },
);
