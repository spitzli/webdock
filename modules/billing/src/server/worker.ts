import type { PlatformDatabaseRuntime } from "@webdock/platform-db/types";
import type { createBillingJobs } from "./jobs";
import type { createBillingReconcile } from "./reconcile";
import type { createBillingCatalogReconcile } from "./catalog-reconcile";
import type { createBillingDispatch } from "./dispatch";
import { BillingReviewError } from "./reconcile-policy";
import { environmentSchema, type BillingEnvironment } from "./types";

/** Explicit composition retains existing operation journals, scopes and provider uncertainty fences. */
export function createBillingWorker(dependencies: {
  databasePools: Pick<PlatformDatabaseRuntime, "worker">;
  billingDispatcher: ReturnType<typeof createBillingJobs>["billingDispatcher"];
  claimBillingJob: ReturnType<typeof createBillingJobs>["claimBillingJob"];
  renewBillingJob: ReturnType<typeof createBillingJobs>["renewBillingJob"];
  completeBillingJob: ReturnType<
    typeof createBillingJobs
  >["completeBillingJob"];
  failBillingJob: ReturnType<typeof createBillingJobs>["failBillingJob"];
  reconcileCustomer: ReturnType<
    typeof createBillingReconcile
  >["reconcileCustomer"];
  reconcileCatalog: ReturnType<
    typeof createBillingCatalogReconcile
  >["reconcileCatalog"];
  dispatchWebhook: ReturnType<typeof createBillingDispatch>["dispatchWebhook"];
}) {
  const {
    databasePools,
    billingDispatcher,
    claimBillingJob,
    renewBillingJob,
    completeBillingJob,
    failBillingJob,
    reconcileCustomer,
    reconcileCatalog,
    dispatchWebhook,
  } = dependencies;

  const scheduled = new Map<BillingEnvironment, number>();

  function billingWorkerEnvironments(
    raw: string | undefined,
  ): BillingEnvironment[] {
    const values = raw?.split(",").filter(Boolean) || [];
    if (!values.length || new Set(values).size !== values.length)
      throw Error("Explicit billing worker environments required");
    return values.map((value) => environmentSchema.parse(value));
  }

  async function schedule(environment: BillingEnvironment) {
    const minute = Math.floor(Date.now() / 60_000);
    if (scheduled.get(environment) === minute) return;
    await billingDispatcher(environment, async () => {
      // Uncertain external writes are never automatically repeated by the read worker.
      await databasePools.worker.query(
        "UPDATE webdock_auth.billing_job SET status='needs_review',error_code='operation_unconfirmed',lease_until=NULL WHERE environment=$1 AND kind IN ('checkout','publish','endpoint','subscription-change') AND status='running' AND lease_until<now()",
        [environment],
      );
      let after = "";
      for (;;) {
        const page = (
          await databasePools.worker.query(
            "SELECT * FROM webdock_rls.billing_due_customers($1,$2,100)",
            [environment, after],
          )
        ).rows as { customer_id: string; interval_minutes: number }[];
        for (const customer of page) {
          const slot = Math.floor(
            Date.now() / (customer.interval_minutes * 60_000),
          );
          await databasePools.worker.query(
            "INSERT INTO webdock_auth.billing_job(environment,customer_id,kind,dedupe_key) VALUES($1,$2,'reconcile',$3) ON CONFLICT(environment,dedupe_key) DO NOTHING",
            [
              environment,
              customer.customer_id,
              `periodic:${customer.customer_id}:${customer.interval_minutes}:${slot}`,
            ],
          );
        }
        if (page.length < 100) break;
        after = page.at(-1)!.customer_id;
      }
      await databasePools.worker.query(
        "INSERT INTO webdock_auth.billing_job(environment,kind,dedupe_key) VALUES($1,'catalog',$2) ON CONFLICT(environment,dedupe_key) DO NOTHING",
        [environment, "catalog-daily:" + Math.floor(Date.now() / 86_400_000)],
      );
    });
    scheduled.set(environment, minute);
  }

  async function runBillingBatch(
    environments: BillingEnvironment[],
    stopping: () => boolean,
  ) {
    for (const environment of environments) {
      if (stopping()) break;
      await schedule(environment);
      for (let n = 0; n < 25 && !stopping(); n++) {
        const job = await claimBillingJob(environment);
        if (!job) break;
        let lost = false;
        const heartbeat = setInterval(() => {
          void renewBillingJob(environment, job)
            .then((valid) => {
              if (!valid) lost = true;
            })
            .catch(() => {
              lost = true;
            });
        }, 20_000);
        try {
          if (job.kind === "webhook") {
            await dispatchWebhook(environment, job);
            continue;
          }
          if (job.kind === "catalog") await reconcileCatalog(environment);
          else {
            if (!job.customerID)
              throw new BillingReviewError("customer_missing");
            const result = await reconcileCustomer(
              environment,
              job.customerID,
              undefined,
              () => !lost,
              job,
            );
            if (!result.applied) throw Error("Stale billing read");
            if (result.reviews?.length)
              throw new BillingReviewError(result.reviews[0]);
          }
          if (!lost) await completeBillingJob(environment, job);
        } catch (error) {
          if (!lost) await failBillingJob(environment, job, error);
          console.error(
            JSON.stringify({
              event: "billing_job_failed",
              environment,
              id: job.id,
              kind: job.kind,
            }),
          );
        } finally {
          clearInterval(heartbeat);
        }
      }
    }
  }
  return { billingWorkerEnvironments, runBillingBatch };
}
