import { BillingReviewError } from "./reconcile-policy";
import { randomUUID } from "node:crypto";
import { withDatabaseScope } from "@webdock/database-runtime";
import { databasePools } from "../../db/runtime";
import { environmentSchema, type BillingEnvironment } from "./types";
export type BillingJob = {
  id: string;
  kind: "webhook" | "reconcile" | "catalog";
  customerID: string | null;
  eventID: string | null;
  claimToken: string;
  attempts: number;
};
export function billingDispatcher<T>(
  environment: BillingEnvironment,
  run: () => T,
): T {
  environmentSchema.parse(environment);
  return withDatabaseScope(
    { kind: "system", purpose: `polar:${environment}:dispatcher` },
    run,
  );
}
export function claimBillingJob(
  environment: BillingEnvironment,
): Promise<BillingJob | null> {
  return billingDispatcher(environment, async () => {
    await databasePools.worker.query(
      "UPDATE webdock_auth.billing_job SET status='failed',error_code='attempts_exhausted',lease_until=NULL WHERE environment=$1 AND status='running' AND lease_until<now() AND attempts>=8",
      [environment],
    );
    const token = randomUUID();
    const row = (
      await databasePools.worker.query(
        `WITH next AS (
 SELECT id FROM webdock_auth.billing_job WHERE environment=$1 AND kind IN ('webhook','reconcile','catalog') AND attempts<8 AND available_at<=now() AND (status='pending' OR (status='running' AND lease_until<now())) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1
 ) UPDATE webdock_auth.billing_job j SET status='running',attempts=attempts+1,claim_token=$2,lease_until=now()+interval '60 seconds' FROM next WHERE j.id=next.id RETURNING j.id,j.kind,j.customer_id AS "customerID",j.event_id AS "eventID",j.attempts`,
        [environment, token],
      )
    ).rows[0];
    return row ? { ...row, claimToken: token } : null;
  });
}
export function completeBillingJob(
  environment: BillingEnvironment,
  job: BillingJob,
): Promise<boolean> {
  return billingDispatcher(
    environment,
    async () =>
      (
        await databasePools.worker.query(
          "UPDATE webdock_auth.billing_job SET status='succeeded',finished_at=now(),lease_until=NULL WHERE environment=$1 AND id=$2 AND claim_token=$3 AND status='running' AND lease_until>now()",
          [environment, job.id, job.claimToken],
        )
      ).rowCount === 1,
  );
}
export function renewBillingJob(
  environment: BillingEnvironment,
  job: BillingJob,
): Promise<boolean> {
  return billingDispatcher(
    environment,
    async () =>
      (
        await databasePools.worker.query(
          "UPDATE webdock_auth.billing_job SET lease_until=now()+interval '60 seconds' WHERE environment=$1 AND id=$2 AND claim_token=$3 AND status='running' AND lease_until>now()",
          [environment, job.id, job.claimToken],
        )
      ).rowCount === 1,
  );
}
export function failBillingJob(
  environment: BillingEnvironment,
  job: BillingJob,
  error: unknown,
): Promise<void> {
  return billingDispatcher(environment, async () => {
    if (error instanceof BillingReviewError) {
      await databasePools.worker.query(
        "UPDATE webdock_auth.billing_job SET status='needs_review',lease_until=NULL,error_code=$4 WHERE environment=$1 AND id=$2 AND claim_token=$3 AND status='running' AND lease_until>now()",
        [
          environment,
          job.id,
          job.claimToken,
          /^[a-z_]{1,64}$/.test(error.reason)
            ? error.reason
            : "review_required",
        ],
      );
      return;
    }
    const minutes = [1, 5, 15, 60][Math.min(Math.max(job.attempts - 1, 0), 3)];
    const failure = error as {
      statusCode?: number;
      retryAfter?: number;
    } | null;
    const retryAfter =
      failure?.statusCode === 429 &&
      typeof failure.retryAfter === "number" &&
      Number.isFinite(failure.retryAfter) &&
      failure.retryAfter > 0
        ? Math.min(failure.retryAfter, 604800)
        : 0;
    const delay = Math.max(minutes * 60, retryAfter),
      code =
        failure?.statusCode === 429
          ? "provider_rate_limit"
          : "provider_unavailable";
    await databasePools.worker.query(
      "UPDATE webdock_auth.billing_job SET status=CASE WHEN attempts>=8 THEN 'failed' ELSE 'pending' END,available_at=now()+$4::integer*interval '1 second',lease_until=NULL,error_code=$5 WHERE environment=$1 AND id=$2 AND claim_token=$3 AND status='running' AND lease_until>now()",
      [environment, job.id, job.claimToken, delay, code],
    );
  });
}
