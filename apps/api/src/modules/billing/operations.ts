import { and, eq, sql, desc } from "drizzle-orm";
import { billingJob as jobs } from "../../db/schema/billing";
import {
  operatorTransaction,
  billingAudit,
  type BillingActor,
} from "./context";
import { BillingError, environmentSchema } from "./types";
import { recordID } from "../registry/contracts";
export async function billingJobs(actor: BillingActor, raw: unknown) {
  const environment = environmentSchema.parse(raw);
  return operatorTransaction(actor, async (tx) =>
    JSON.parse(
      JSON.stringify(
        await tx
          .select({
            id: jobs.id,
            kind: jobs.kind,
            status: jobs.status,
            customerID: jobs.customerId,
            attempts: jobs.attempts,
            availableAt: jobs.availableAt,
            errorCode: jobs.errorCode,
          })
          .from(jobs)
          .where(
            and(
              eq(jobs.environment, environment),
              sql`${jobs.status} IN ('failed','needs_review')`,
            ),
          )
          .orderBy(desc(jobs.createdAt))
          .limit(50),
      ),
    ),
  );
}
export async function retryReadJob(actor: BillingActor, raw: unknown) {
  const id = recordID.parse(raw);
  return operatorTransaction(actor, async (tx) => {
    try {
      await tx.execute(sql`SELECT webdock_rls.retry_billing_read(${id})`);
    } catch (error) {
      if ((error as { cause?: { code?: string } }).cause?.code === "55000")
        throw new BillingError(
          "This operation requires an integrity review or its original write workflow.",
          409,
        );
      throw error;
    }
    await billingAudit(tx, actor, "read-job-retried", id);
    return { status: "pending" };
  });
}
export async function enqueueCustomerRead(actor: BillingActor, raw: unknown) {
  const input = (await import("zod")).z
    .object({ environment: environmentSchema, customerID: recordID })
    .strict()
    .parse(raw);
  return operatorTransaction(actor, async (tx) => {
    await tx
      .insert(jobs)
      .values({
        environment: input.environment,
        customerId: input.customerID,
        kind: "reconcile",
        dedupeKey:
          "operator-read:" +
          input.customerID +
          ":" +
          Math.floor(Date.now() / 60_000),
      })
      .onConflictDoNothing();
    await billingAudit(
      tx,
      actor,
      "customer-read-requested",
      input.environment + ":" + input.customerID,
    );
    return { status: "pending" };
  });
}
