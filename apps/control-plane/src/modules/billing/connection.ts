import { createBillingConnection } from "@webdock/module-billing/server/connection";
import { operatorTransaction, billingAudit } from "./context";
import { sealBilling } from "./crypto";
import { probeOrganization } from "./polar";

export const { connectionStatus, saveConnection, updateSwitches } =
  createBillingConnection({
    operatorTransaction,
    billingAudit,
    sealBilling,
    probeOrganization,
  });
