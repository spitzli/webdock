import { createHash } from "node:crypto";
import { z } from "zod";
import { databasePools } from "../../db/runtime";
import { openBilling } from "./crypto";
import { billingDispatcher, type BillingJob } from "./jobs";
import { billingWorkerProvider } from "./worker-provider";
import type { BillingEnvironment } from "./types";
const reference = z.object({
  id: z.uuid(),
  customer_id: z.uuid().nullable().optional(),
  external_customer_id: z.string().nullable().optional(),
});
export async function dispatchWebhook(
  environment: BillingEnvironment,
  job: BillingJob,
): Promise<boolean> {
  return billingDispatcher(environment, async () => {
    const receipt = (
      await databasePools.worker.query(
        "SELECT id,body_hash,encrypted_body,status,event_type FROM webdock_auth.billing_webhook_event WHERE environment=$1 AND id=$2",
        [environment, job.eventID],
      )
    ).rows[0];
    if (!receipt || receipt.status !== "received") return false;
    const plaintext = openBilling<string>(
      receipt.encrypted_body,
      environment,
      "event",
      1,
    );
    if (
      createHash("sha256").update(plaintext).digest("hex") !== receipt.body_hash
    )
      throw Error("Billing receipt integrity mismatch");
    const body = JSON.parse(plaintext);
    let customerID: string | null = null;
    const catalog = receipt.event_type === "product.updated";
    if (!catalog) {
      const objectID = z.uuid().parse(body.data.id),
        { polar, organizationID } = await billingWorkerProvider(environment);
      let external: string | null = null,
        polarID: string | null = null;
      if (receipt.event_type === "customer.state_changed") polarID = objectID;
      else {
        const current = reference.parse(
          receipt.event_type.startsWith("subscription.")
            ? await polar.subscriptions.get(objectID)
            : receipt.event_type.startsWith("order.")
              ? await polar.orders.get(objectID)
              : await polar.checkouts.get(objectID),
        );
        if (current.id !== objectID) throw Error("Provider reference mismatch");
        polarID = current.customer_id || null;
        external = current.external_customer_id || null;
      }
      if (polarID) {
        const customer = await polar.customers.get(polarID);
        if (
          customer.id !== polarID ||
          customer.organization_id !== organizationID
        )
          throw Error("Billing organization mismatch");
        external = customer.external_id ?? null;
      }
      if (external && /^webdock:[1-9]\d{0,18}$/.test(external))
        customerID = (
          await databasePools.worker.query(
            "SELECT webdock_rls.billing_customer_lookup($1,$2,$3) AS id",
            [environment, external, polarID],
          )
        ).rows[0].id;
    }
    const tx = await databasePools.worker.connect();
    try {
      await tx.query("BEGIN");
      // Same lock order as conflict quarantine: receipt, then its job.
      const current = (
        await tx.query(
          "SELECT status FROM webdock_auth.billing_webhook_event WHERE environment=$1 AND id=$2 FOR UPDATE",
          [environment, receipt.id],
        )
      ).rows[0];
      const claim = (
        await tx.query(
          "SELECT id FROM webdock_auth.billing_job WHERE environment=$1 AND id=$2 AND claim_token=$3 AND status='running' AND lease_until>now() FOR UPDATE",
          [environment, job.id, job.claimToken],
        )
      ).rows[0];
      if (!claim || current?.status !== "received") {
        await tx.query("ROLLBACK");
        return false;
      }
      if (catalog || customerID) {
        const kind = catalog ? "catalog" : "reconcile",
          key = catalog
            ? "catalog:" + Math.floor(Date.now() / 60_000)
            : "customer-event:" + receipt.id;
        await tx.query(
          "INSERT INTO webdock_auth.billing_job(environment,customer_id,kind,dedupe_key) VALUES($1,$2,$3,$4) ON CONFLICT(environment,dedupe_key) DO NOTHING",
          [environment, customerID, kind, key],
        );
      }
      await tx.query(
        "UPDATE webdock_auth.billing_webhook_event SET status=$3,processed_at=now(),error_code=$4 WHERE environment=$1 AND id=$2",
        [
          environment,
          receipt.id,
          catalog || customerID ? "processed" : "quarantined",
          catalog || customerID ? null : "unmatched_customer",
        ],
      );
      await tx.query(
        "UPDATE webdock_auth.billing_job SET status=$4,finished_at=now(),lease_until=NULL,error_code=$5 WHERE environment=$1 AND id=$2 AND claim_token=$3",
        [
          environment,
          job.id,
          job.claimToken,
          catalog || customerID ? "succeeded" : "needs_review",
          catalog || customerID ? null : "unmatched_customer",
        ],
      );
      await tx.query("COMMIT");
      return true;
    } catch (error) {
      await tx.query("ROLLBACK");
      throw error;
    } finally {
      tx.release();
    }
  });
}
