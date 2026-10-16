import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { withDatabaseScope } from "@webdock/database-runtime";
import {
  billingManualRelease as releases,
  billingContract as contracts,
  billingSubscription as subscriptions,
  billingCustomer as customers,
  billingChange as changes,
} from "@webdock/platform-db/schema/billing";
import type { createBillingContext } from "./context";
import type { BillingActor } from "./context";
import { BillingError } from "./types";
import { recordID } from "@webdock/platform-db/ids";
import type { createBillingWorkerProvider } from "./worker-provider";

/** Explicit composition retains existing operation journals, scopes and provider uncertainty fences. */
export function createBillingManual(dependencies: {
  operatorTransaction: ReturnType<
    typeof createBillingContext
  >["operatorTransaction"];
  billingAudit: ReturnType<typeof createBillingContext>["billingAudit"];
  billingWorkerProvider: ReturnType<
    typeof createBillingWorkerProvider
  >["billingWorkerProvider"];
}) {
  const { operatorTransaction, billingAudit, billingWorkerProvider } =
    dependencies;

  type Closed = {
    id: string;
    customerID: string;
    organizationID: string;
    closed: boolean;
    outstanding: boolean;
  };

  async function inspectClosed(id: string): Promise<Closed> {
    const { polar, organizationID } = await billingWorkerProvider("live"),
      subscription = await polar.subscriptions.get(id);
    let outstanding = false,
      count = 0;
    for await (const order of polar.orders.iterList({
      organization_id: organizationID,
      subscription_id: id,
      limit: 100,
    })) {
      if (++count > 10000)
        throw new BillingError("Invoice inventory is incomplete.", 502);
      if (["pending", "draft"].includes(order.status)) outstanding = true;
    }
    return {
      id: subscription.id,
      customerID: subscription.customer_id,
      organizationID: subscription.customer.organization_id,
      closed:
        ["canceled", "incomplete_expired"].includes(subscription.status) &&
        subscription.product.organization_id === organizationID,
      outstanding,
    };
  }

  async function releaseToManual(
    actor: BillingActor,
    raw: unknown,
    inspect: (id: string) => Promise<Closed> = inspectClosed,
  ) {
    const input = z
      .object({
        customerID: recordID,
        contractID: recordID,
        revision: z.number().int().nonnegative(),
        confirmName: z.string().min(1).max(160),
        reason: z.string().trim().min(1).max(1000),
      })
      .strict()
      .parse(raw);
    const prepared = await operatorTransaction(actor, async (tx) => {
      const prior = (
        await tx
          .select({ id: releases.id })
          .from(releases)
          .where(eq(releases.contractId, input.contractID))
      )[0];
      if (prior) return { already: true as const };
      const contract = (
        await tx
          .select()
          .from(contracts)
          .where(
            and(
              eq(contracts.id, input.contractID),
              eq(contracts.customerId, input.customerID),
              eq(contracts.environment, "live"),
            ),
          )
      )[0];
      const subscription = (
        await tx
          .select()
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.contractId, input.contractID),
              eq(subscriptions.environment, "live"),
            ),
          )
      )[0];
      const customer = (
        await tx
          .select()
          .from(customers)
          .where(
            and(
              eq(customers.customerId, input.customerID),
              eq(customers.environment, "live"),
            ),
          )
      )[0];
      if (
        !contract?.projectedAt ||
        contract.state !== "ended" ||
        !subscription ||
        !customer?.polarCustomerId
      )
        throw new BillingError(
          "End and reconcile the paid agreement before releasing it to manual management.",
          409,
        );
      return { already: false as const, contract, subscription, customer };
    });
    if (prepared.already) return { state: "manual" };
    const confirmed = await withDatabaseScope(
      {
        kind: "system",
        purpose: "polar:live:customer",
        customerID: input.customerID,
      },
      () => inspect(prepared.subscription.polarSubscriptionId),
    );
    if (
      !confirmed.closed ||
      confirmed.outstanding ||
      confirmed.id !== prepared.subscription.polarSubscriptionId ||
      confirmed.customerID !== prepared.customer.polarCustomerId ||
      confirmed.organizationID !==
        (prepared.contract.snapshot as { polarOrganizationID: string })
          .polarOrganizationID
    )
      throw new BillingError(
        "The provider agreement is not fully closed or has outstanding invoices.",
        409,
      );
    return operatorTransaction(actor, async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${"plan:" + input.customerID},0))`,
      );
      const current = (
        await tx.execute<{ name: string; revision: number }>(
          sql`SELECT c.name,s.revision FROM webdock_admin.customers c JOIN webdock_auth.tenant_subscription s ON s.customer_id=c.id WHERE c.id=${input.customerID} FOR UPDATE OF s`,
        )
      ).rows[0];
      const contract = (
        await tx
          .select()
          .from(contracts)
          .where(eq(contracts.id, input.contractID))
          .for("update")
      )[0];
      if (
        !current ||
        current.name !== input.confirmName ||
        current.revision !== input.revision ||
        contract.state !== "ended"
      )
        throw new BillingError(
          "The customer or plan changed. Review the manual release again.",
          409,
        );
      if (
        (
          await tx
            .select({ id: changes.id })
            .from(changes)
            .where(
              and(
                eq(changes.contractId, input.contractID),
                sql`${changes.status} NOT IN ('applied','failed')`,
              ),
            )
            .limit(1)
        )[0]
      )
        throw new BillingError(
          "Resolve the pending subscription change first.",
          409,
        );
      const added = await tx
        .insert(releases)
        .values({
          customerId: input.customerID,
          contractId: input.contractID,
          actorId: actor.subject,
          reason: input.reason,
          expectedRevision: input.revision,
        })
        .onConflictDoNothing()
        .returning({ id: releases.id });
      if (added.length)
        await billingAudit(tx, actor, "manual-release", input.contractID);
      return { state: "manual" };
    });
  }

  async function operatorCustomerBilling(actor: BillingActor, raw: unknown) {
    const input = z
      .object({
        customerID: recordID,
        environment: z.enum(["sandbox", "live"]),
      })
      .strict()
      .parse(raw);
    return operatorTransaction(actor, async (tx) => {
      const customer = (
        await tx.execute<{ id: string; name: string; revision: number | null }>(
          sql`SELECT c.id,c.name,s.revision FROM webdock_admin.customers c LEFT JOIN webdock_auth.tenant_subscription s ON s.customer_id=c.id WHERE c.id=${input.customerID}`,
        )
      ).rows[0];
      if (!customer) throw new BillingError("Customer unavailable.", 404);
      const agreements = await tx
        .select({
          id: contracts.id,
          state: contracts.state,
          serviceStatus: contracts.serviceStatus,
          snapshot: contracts.snapshot,
          manualReleaseID: releases.id,
        })
        .from(contracts)
        .leftJoin(releases, eq(releases.contractId, contracts.id))
        .where(
          and(
            eq(contracts.customerId, input.customerID),
            eq(contracts.environment, input.environment),
          ),
        );
      return { customer, environment: input.environment, agreements };
    });
  }
  return { releaseToManual, operatorCustomerBilling };
}
