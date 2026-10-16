import { requireInstalledOperation } from "../../installation";
import { createBillingOffers } from "@webdock/module-billing/server/offers";
import { databasePools } from "../../db/runtime";
import {
  operatorTransaction,
  customerTransaction,
  billingAudit,
} from "./context";

export const {
  enableSandboxCustomer,
  createOffer,
  revokeOffer,
  getBillingOffer,
} = createBillingOffers({
  requireOperation: requireInstalledOperation,
  databasePools,
  operatorTransaction,
  customerTransaction,
  billingAudit,
  studioOriginSetting: () => process.env.WEBDOCK_STUDIO_ORIGIN,
});
