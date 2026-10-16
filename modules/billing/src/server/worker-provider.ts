import type { PlatformDatabaseRuntime } from "@webdock/platform-db/types";
import type { createBillingCrypto } from "./crypto";
import type { BillingProviderPorts } from "./provider";
import { BillingError, type BillingEnvironment } from "./types";

/** Explicit composition retains existing operation journals, scopes and provider uncertainty fences. */
export function createBillingWorkerProvider(dependencies: {
  databasePools: Pick<PlatformDatabaseRuntime, "worker">;
  openBilling: ReturnType<typeof createBillingCrypto>["openBilling"];
  billingPolar: BillingProviderPorts["billingPolar"];
}) {
  const { databasePools, openBilling, billingPolar } = dependencies;

  async function billingWorkerProvider(environment: BillingEnvironment) {
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
  return { billingWorkerProvider };
}
