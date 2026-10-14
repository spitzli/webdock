import { and, eq, sql, desc } from "drizzle-orm";
import { z } from "zod";
import {
  billingChange as changes,
  billingCustomer as customers,
  billingContract as contracts,
  billingCheckout as checkouts,
  billingSubscription as subscriptions,
  billingOrder as orders,
} from "../../db/schema/billing";
import { customerTransaction, type BillingActor } from "./context";
import { BillingError, environmentSchema } from "./types";
import { recordID } from "../registry/contracts";
import { createCheckout } from "./checkout";
const inputSchema = z
  .object({ environment: environmentSchema, customerID: recordID })
  .strict();
const serialize = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );
export async function tenantBilling(actor: BillingActor, raw: unknown) {
  const input = inputSchema.parse(raw);
  return customerTransaction(actor, input.customerID, async (tx) => {
    const config = (
      await tx.execute<{ value: { salesEnabled: boolean } | null }>(
        sql`SELECT webdock_rls.billing_sale_config(${input.environment},${input.customerID}) AS value`,
      )
    ).rows[0].value;
    const catalog = (
      await tx.execute<{ value: unknown }>(
        sql`SELECT webdock_rls.billing_catalog(${input.environment},${input.customerID}) AS value`,
      )
    ).rows.map((row) => row.value);
    const sites = (
      await tx.execute<{ value: unknown }>(
        sql`SELECT webdock_rls.billing_sites(${input.customerID},${new URL(process.env.WEBDOCK_STUDIO_ORIGIN!).origin}) AS value`,
      )
    ).rows.map((row) => row.value);
    const customer = (
      await tx
        .select({ id: customers.polarCustomerId })
        .from(customers)
        .where(
          and(
            eq(customers.environment, input.environment),
            eq(customers.customerId, input.customerID),
          ),
        )
    )[0];
    const agreements = await tx
      .select({
        id: contracts.id,
        versionID: contracts.versionId,
        state: contracts.state,
        serviceStatus: contracts.serviceStatus,
        snapshot: contracts.snapshot,
        projectID: contracts.projectId,
        bindingID: contracts.bindingId,
        termsHash: contracts.termsHash,
      })
      .from(contracts)
      .where(
        and(
          eq(contracts.environment, input.environment),
          eq(contracts.customerId, input.customerID),
        ),
      )
      .orderBy(desc(contracts.acceptedAt));
    const attempts = await tx
      .select({
        id: checkouts.id,
        contractID: checkouts.contractId,
        state: checkouts.state,
        expiresAt: checkouts.expiresAt,
      })
      .from(checkouts)
      .where(
        and(
          eq(checkouts.environment, input.environment),
          eq(checkouts.customerId, input.customerID),
        ),
      )
      .orderBy(desc(checkouts.createdAt));
    const current = await tx
      .select({
        id: subscriptions.id,
        contractID: subscriptions.contractId,
        status: subscriptions.status,
        initialOrderPaid: subscriptions.initialOrderPaid,
        amount: subscriptions.amount,
        currency: subscriptions.currency,
        periodEnd: subscriptions.periodEnd,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
        reconciledAt: subscriptions.reconciledAt,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.environment, input.environment),
          eq(subscriptions.customerId, input.customerID),
        ),
      );
    const invoices = await tx
      .select({
        id: orders.id,
        contractID: orders.contractId,
        status: orders.status,
        totalAmount: orders.totalAmount,
        currency: orders.currency,
        refundedAmount: orders.refundedAmount,
        reconciledAt: orders.reconciledAt,
      })
      .from(orders)
      .where(
        and(
          eq(orders.environment, input.environment),
          eq(orders.customerId, input.customerID),
        ),
      )
      .orderBy(desc(orders.reconciledAt))
      .limit(100);
    const amendments = await tx
      .select({
        id: changes.id,
        contractID: changes.contractId,
        subscriptionID: changes.subscriptionId,
        status: changes.status,
        direction: changes.direction,
        snapshot: changes.snapshot,
        effectiveAt: changes.effectiveAt,
        appliedAt: changes.appliedAt,
        acceptedAt: changes.acceptedAt,
      })
      .from(changes)
      .where(
        and(
          eq(changes.environment, input.environment),
          eq(changes.customerId, input.customerID),
        ),
      )
      .orderBy(desc(changes.acceptedAt), desc(changes.id));
    const effectiveAgreements = agreements.map((agreement) => ({
      ...agreement,
      originalSnapshot: agreement.snapshot,
      snapshot:
        amendments.find(
          (change) =>
            change.contractID === agreement.id && change.status === "applied",
        )?.snapshot || agreement.snapshot,
    }));
    return serialize({
      environment: input.environment,
      customerID: input.customerID,
      salesEnabled: config?.salesEnabled === true,
      canOpenPortal: !!customer?.id,
      catalog,
      sites,
      agreements: effectiveAgreements,
      changes: amendments,
      attempts,
      subscriptions: current,
      orders: invoices,
    });
  });
}
export async function resumeCheckout(actor: BillingActor, raw: unknown) {
  const input = inputSchema.extend({ attemptID: recordID }).parse(raw);
  const accepted = await customerTransaction(
    actor,
    input.customerID,
    async (tx) => {
      const row = (
        await tx
          .select({ contract: contracts })
          .from(checkouts)
          .innerJoin(contracts, eq(contracts.id, checkouts.contractId))
          .where(
            and(
              eq(checkouts.id, input.attemptID),
              eq(checkouts.environment, input.environment),
              eq(checkouts.customerId, input.customerID),
            ),
          )
      )[0];
      if (
        !row ||
        ["ended", "withdrawn", "paid_needs_review"].includes(row.contract.state)
      )
        throw new BillingError("This checkout requires review.", 409);
      return {
        environment: input.environment,
        customerID: input.customerID,
        versionID: row.contract.versionId,
        bindingID: row.contract.bindingId,
        projectID: row.contract.projectId,
        termsHash: row.contract.termsHash,
        acceptTerms: true,
      };
    },
  );
  return createCheckout(actor, accepted);
}
