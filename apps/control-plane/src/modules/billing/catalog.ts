import { requireInstalledOperation } from "../../installation";
import { createBillingCatalog } from "@webdock/module-billing/server/catalog";
import { operatorTransaction, billingAudit } from "./context";
import { openBilling } from "./crypto";
import { billingPolar } from "./polar";

export { productVersionInput } from "./catalog-input";
export const {
  createProductVersion,
  listProducts,
  publishProduct,
  setProductAvailability,
  archiveProduct,
} = createBillingCatalog({
  requireOperation: requireInstalledOperation,
  operatorTransaction,
  billingAudit,
  openBilling,
  billingPolar,
});
