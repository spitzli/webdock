import { databasePools } from "../../db/runtime";
import { openBilling } from "./crypto";
import { billingPolar } from "./polar";
import { BillingError, type BillingEnvironment } from "./types";
export async function billingWorkerProvider(environment: BillingEnvironment) {
  const row = (
    await databasePools.worker.query(
      "SELECT webdock_rls.billing_secret($1,'token') AS value",
      [environment],
    )
  ).rows[0].value as {
    encrypted?: string;
    version: number;
    organizationID?: string;
  } | null;
  if (!row?.encrypted || !row.organizationID)
    throw new BillingError("Billing provider is unavailable.", 503);
  return {
    organizationID: row.organizationID,
    polar: billingPolar(
      environment,
      openBilling<string>(row.encrypted, environment, "token", row.version),
    ),
  };
}
