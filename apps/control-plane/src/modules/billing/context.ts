import { legacyClerkMemberships } from "../auth/clerk-provider";
import { currentConsolePrincipal } from "../auth/principal";
import { createBillingContext } from "@webdock/module-billing/server/context";
import { databasePools } from "../../db/runtime";
export type { BillingActor } from "@webdock/module-billing/server/context";

export const {
  billingActor,
  operatorTransaction,
  billingAudit,
  customerTransaction,
  customerReadTransaction,
} = createBillingContext({
  databasePools,
  legacyClerkMemberships,
  hasConsolePrincipal: () => !!currentConsolePrincipal(),
});
