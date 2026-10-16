import { createBillingContext } from "@webdock/module-billing/server/context";
import { databasePools } from "../../db/runtime";
export type { BillingActor } from "@webdock/module-billing/server/context";

export const {
  billingActor,
  operatorTransaction,
  billingAudit,
  customerTransaction,
} = createBillingContext({ databasePools });
