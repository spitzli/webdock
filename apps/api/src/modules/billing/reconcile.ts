import { createHash } from "node:crypto";
import { and, eq, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { withDatabaseScope } from "@webdock/database-runtime";
import { databasePools } from "../../db/runtime";
import {
  billingManualRelease as releases,
  billingChange as changes,
  billingCustomer as customers,
  billingContract as contracts,
  billingCheckout as checkouts,
  billingSubscription as subscriptions,
  billingOrder as orders,
  billingJob as jobs,
} from "../../db/schema/billing";
import { billingWorkerProvider } from "./worker-provider";
import { storedCheckoutTerms, versionSchema } from "./checkout";
import { verifyCheckout } from "./checkout-policy";
import { normalizeSubscription, BillingReviewError } from "./reconcile-policy";
import { sealBilling } from "./crypto";
import { environmentSchema, type BillingEnvironment } from "./types";
import { recordID } from "../registry/contracts";
type Snapshot = {
  complete: true;
  customer: unknown | null;
  checkouts: unknown[];
  subscriptions: unknown[];
  orders: unknown[];
};
type Provider = {
  organizationID: string;
  read: (externalID: string) => Promise<Snapshot>;
};
async function collect<T>(iterator: AsyncIterable<T>): Promise<T[]> {
  const rows: T[] = [];
  for await (const row of iterator) {
    if (rows.length >= 10000) throw new BillingReviewError("inventory_limit");
    rows.push(row);
  }
  return rows;
}
async function provider(environment: BillingEnvironment): Promise<Provider> {
  const { polar, organizationID } = await billingWorkerProvider(environment);
  return {
    organizationID,
    read: async (externalID) => {
      let customer: unknown | null;
      try {
        customer = await polar.customers.getExternal(externalID);
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode === 404)
          customer = null;
        else throw error;
      }
      const query = {
        organization_id: organizationID,
        external_customer_id: externalID,
        limit: 100,
      };
      // Two external requests at most; each iterator must finish before any projection.
      const [checkoutRows, subscriptionRows] = await Promise.all([
        collect(polar.checkouts.iterList(query)),
        collect(polar.subscriptions.iterList(query)),
      ]);
      const orderRows = await collect(polar.orders.iterList(query));
      const currentSubscriptions = [];
      for (const row of subscriptionRows)
        currentSubscriptions.push(await polar.subscriptions.get(row.id));
      return {
        complete: true,
        customer,
        checkouts: checkoutRows,
        subscriptions: currentSubscriptions,
        orders: orderRows,
      };
    },
  };
}
const customerSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  external_id: z.string(),
  email: z.email().nullable().optional(),
});
export async function reconcileCustomer(
  environment: BillingEnvironment,
  customerID: string,
  factory: (env: BillingEnvironment) => Promise<Provider> = provider,
  isCurrent: () => boolean = () => true,
  claim?: { id: string; claimToken: string },
) {
  environmentSchema.parse(environment);
  recordID.parse(customerID);
  return withDatabaseScope(
    { kind: "system", purpose: `polar:${environment}:customer`, customerID },
    async () => {
      const initial = await databasePools.workerOrm.transaction(async (tx) => {
        const customer = (
          await tx
            .select()
            .from(customers)
            .where(
              and(
                eq(customers.environment, environment),
                eq(customers.customerId, customerID),
              ),
            )
            .for("update")
        )[0];
        if (!customer) throw new BillingReviewError("customer_unmapped");
        const generation = customer.generation + 1n;
        await tx
          .update(customers)
          .set({ generation })
          .where(
            and(
              eq(customers.environment, environment),
              eq(customers.customerId, customerID),
            ),
          );
        return {
          customer,
          generation,
          releases:
            environment === "live"
              ? await tx
                  .select({ contractID: releases.contractId })
                  .from(releases)
                  .where(eq(releases.customerId, customerID))
              : [],
          changes: await tx
            .select()
            .from(changes)
            .where(
              and(
                eq(changes.environment, environment),
                eq(changes.customerId, customerID),
              ),
            )
            .orderBy(desc(changes.appliedAt), desc(changes.id)),
          contracts: await tx
            .select()
            .from(contracts)
            .where(
              and(
                eq(contracts.environment, environment),
                eq(contracts.customerId, customerID),
              ),
            ),
          attempts: await tx
            .select()
            .from(checkouts)
            .where(
              and(
                eq(checkouts.environment, environment),
                eq(checkouts.customerId, customerID),
              ),
            ),
          subscriptions: await tx
            .select()
            .from(subscriptions)
            .where(
              and(
                eq(subscriptions.environment, environment),
                eq(subscriptions.customerId, customerID),
              ),
            ),
        };
      });
      const client = await factory(environment),
        remote = await client.read("webdock:" + customerID);
      if (remote.complete !== true)
        throw new BillingReviewError("incomplete_inventory");
      const customer =
        remote.customer === null ? null : customerSchema.parse(remote.customer);
      if (
        customer &&
        (customer.external_id !== "webdock:" + customerID ||
          customer.organization_id !== client.organizationID ||
          (initial.customer.polarCustomerId &&
            customer.id !== initial.customer.polarCustomerId))
      )
        throw new BillingReviewError("customer_mismatch");
      if (!customer && (remote.subscriptions.length || remote.orders.length))
        throw new BillingReviewError("customer_missing");
      const checkedAttempts = new Map<
        string,
        ReturnType<typeof verifyCheckout>
      >();
      for (const attempt of initial.attempts) {
        const contract = initial.contracts.find(
          (row) => row.id === attempt.contractId,
        );
        if (!contract) throw new BillingReviewError("contract_missing");
        const terms = storedCheckoutTerms(
          environment,
          customerID,
          contract,
          attempt,
        );
        if (terms.organizationID !== client.organizationID)
          throw new BillingReviewError("organization_mismatch");
        const matches = remote.checkouts.filter((raw) => {
          const row = raw as {
            id?: string;
            metadata?: { webdock_operation_id?: string };
          };
          return (
            row.id === attempt.polarCheckoutId ||
            row.metadata?.webdock_operation_id === attempt.operationId
          );
        });
        if (matches.length > 1)
          throw new BillingReviewError("duplicate_checkout");
        if (matches.length)
          checkedAttempts.set(attempt.id, verifyCheckout(matches[0], terms));
      }
      const confirmed = new Map<
          string,
          ReturnType<typeof normalizeSubscription>
        >(),
        seen = new Set<string>(),
        reviews = new Set<string>();
      const appliedChanges = new Map<string, string>(),
        scheduledChanges = new Map<string, Date>();
      for (const raw of remote.subscriptions) {
        const reference = z
          .object({ id: z.uuid(), checkout_id: z.uuid().nullable() })
          .parse(raw);
        const attempt = initial.attempts.find(
          (row) =>
            (checkedAttempts.get(row.id)?.id || row.polarCheckoutId) ===
            reference.checkout_id,
        );
        if (!attempt) {
          reviews.add("unmatched_subscription");
          continue;
        }
        if (seen.has(attempt.contractId)) {
          confirmed.delete(attempt.contractId);
          reviews.add("duplicate_subscription");
          continue;
        }
        seen.add(attempt.contractId);
        const contract = initial.contracts.find(
            (row) => row.id === attempt.contractId,
          )!,
          terms = storedCheckoutTerms(
            environment,
            customerID,
            contract,
            attempt,
          );
        const history = initial.changes.filter(
          (change) =>
            change.contractId === contract.id && change.status !== "failed",
        );
        const metadata = (raw as { metadata?: Record<string, unknown> })
          .metadata;
        const amendment = history.find(
          (change) =>
            metadata?.webdock_change_id === change.id &&
            metadata.webdock_operation_id === change.operationId,
        );
        const effective = versionSchema.parse(
          history.find((change) => change.status === "applied")?.snapshot ||
            contract.snapshot,
        );
        const target = amendment
          ? versionSchema.parse(amendment.snapshot)
          : null;
        const selected =
          target &&
          (raw as { product_id?: string }).product_id === target.productID
            ? target
            : effective;
        const relevant = remote.orders.filter(
          (value) =>
            (value as { subscription_id?: string }).subscription_id ===
            reference.id,
        );
        const old = initial.subscriptions.find(
          (row) => row.contractId === contract.id,
        );
        if (old && old.polarSubscriptionId !== reference.id) {
          reviews.add("subscription_identity_changed");
          continue;
        }
        try {
          const normalized = normalizeSubscription(raw, relevant, {
            organizationID: client.organizationID,
            customerID: customer!.id,
            productID: selected.productID,
            checkoutID:
              checkedAttempts.get(attempt.id)?.id || attempt.polarCheckoutId!,
            priceID: selected.priceIDs[0],
            amount: Number(selected.amount),
            currency: selected.currency,
            interval: selected.interval,
            taxBehavior: selected.taxBehavior,
            previouslyActivated: old?.initialOrderPaid === true,
            initialProduct: {
              productID: terms.productID,
              amount: terms.amount,
              currency: terms.currency,
              taxBehavior: terms.taxBehavior,
            },
            historicalProducts: [
              versionSchema.parse(contract.snapshot),
              ...history.map((change) => versionSchema.parse(change.snapshot)),
            ].map((version) => ({
              productID: version.productID,
              amount: Number(version.amount),
              currency: version.currency,
              taxBehavior: version.taxBehavior,
            })),
          });
          confirmed.set(contract.id, normalized);
          if (amendment && target && amendment.status !== "applied") {
            const pending = (
              raw as {
                pending_update?: {
                  product_id?: string;
                  applies_at?: string;
                } | null;
              }
            ).pending_update;
            if (
              pending?.product_id === target.productID &&
              pending.applies_at &&
              Date.parse(pending.applies_at) === amendment.periodEnd.getTime()
            )
              scheduledChanges.set(amendment.id, new Date(pending.applies_at));
            if (
              normalized.product_id === target.productID &&
              normalized.status === "active"
            ) {
              const baseline = new Set(
                z.array(z.string()).parse(amendment.baselineOrderIds),
              );
              const paid = normalized.orders.some(
                (order) =>
                  !baseline.has(order.id) &&
                  order.product_id === target.productID &&
                  order.billing_reason === "subscription_update" &&
                  order.paid &&
                  ["paid", "partially_refunded"].includes(order.status),
              );
              const effectiveAt = (
                amendment.effectiveAt || amendment.periodEnd
              ).getTime();
              const due =
                Date.parse(normalized.current_period_start) === effectiveAt &&
                Date.now() >= effectiveAt;
              if (amendment.direction === "upgrade" ? paid : due)
                appliedChanges.set(contract.id, amendment.id);
            }
          }
        } catch (error) {
          if (error instanceof BillingReviewError) {
            reviews.add(error.reason);
            continue;
          }
          throw error;
        }
      }
      if (
        remote.orders.some((raw) => {
          const row = raw as { subscription_id?: string };
          return ![...confirmed.values()].some(
            (s) => s.id === row.subscription_id,
          );
        })
      )
        reviews.add("unmatched_order");
      return databasePools.workerOrm.transaction(async (tx) => {
        const current = (
          await tx
            .select()
            .from(customers)
            .where(
              and(
                eq(customers.environment, environment),
                eq(customers.customerId, customerID),
              ),
            )
            .for("update")
        )[0];
        if (!isCurrent() || current?.generation !== initial.generation)
          return { applied: false, reason: "stale_generation" };
        const requireClaim = async () => {
          if (
            claim &&
            !(
              await tx
                .select({ id: jobs.id })
                .from(jobs)
                .where(
                  and(
                    eq(jobs.id, claim.id),
                    eq(jobs.claimToken, claim.claimToken),
                    eq(jobs.status, "running"),
                    sql`${jobs.leaseUntil}>statement_timestamp()`,
                  ),
                )
                .for("share")
            )[0]
          )
            throw new BillingReviewError("lease_lost");
        };
        await requireClaim();
        for (const attempt of initial.attempts) {
          const verified = checkedAttempts.get(attempt.id);
          if (!verified) continue;
          const fresh = (
            await tx
              .select()
              .from(checkouts)
              .where(eq(checkouts.id, attempt.id))
              .for("update")
          )[0];
          if (fresh.polarCheckoutId && fresh.polarCheckoutId !== verified.id)
            throw new BillingReviewError("checkout_identity_changed");
          const hasSubscription = confirmed.has(attempt.contractId);
          const state = hasSubscription
            ? fresh.state
            : verified.status === "expired"
              ? "expired"
              : verified.status === "failed"
                ? "failed"
                : fresh.state === "creating" || fresh.state === "needs_review"
                  ? "open"
                  : fresh.state;
          await tx
            .update(checkouts)
            .set({
              polarCheckoutId: verified.id,
              encryptedUrl: sealBilling(
                { url: verified.url, customerID, attemptID: attempt.id },
                environment,
                "checkout",
                1,
              ),
              expiresAt: verified.expiresAt,
              state,
              updatedAt: new Date(),
            })
            .where(eq(checkouts.id, attempt.id));
          if (!hasSubscription && ["expired", "failed"].includes(state))
            await tx
              .update(contracts)
              .set({ state: "ended", endedAt: new Date() })
              .where(
                and(
                  eq(contracts.id, attempt.contractId),
                  sql`${contracts.projectedAt} IS NULL`,
                  sql`${contracts.state} IN ('pending','withdrawn','needs_review')`,
                ),
              );
        }
        for (const [contractID, state] of confirmed) {
          const attempt = initial.attempts.find(
              (row) => row.contractId === contractID,
            )!,
            contract = (
              await tx
                .select()
                .from(contracts)
                .where(eq(contracts.id, contractID))
                .for("update")
            )[0];
          const values = {
            environment,
            customerId: customerID,
            contractId: contractID,
            polarSubscriptionId: state.id,
            polarProductId: state.product_id,
            checkoutId: attempt.id,
            status: state.status,
            amount: BigInt(state.amount),
            currency: state.currency.toUpperCase(),
            periodStart: new Date(state.current_period_start),
            periodEnd: new Date(state.current_period_end),
            cancelAtPeriodEnd: state.cancel_at_period_end,
            canceledAt: state.canceled_at ? new Date(state.canceled_at) : null,
            pendingUpdate: state.pending_update ?? null,
            pastDueAt:
              state.status === "past_due"
                ? state.past_due_at
                  ? new Date(state.past_due_at)
                  : initial.subscriptions.find(
                      (value) => value.contractId === contractID,
                    )?.pastDueAt || new Date()
                : null,
            reconciledAt: new Date(),
            generation: initial.generation,
            initialOrderPaid: state.initialPaid,
          };
          const subscription = (
            await tx
              .insert(subscriptions)
              .values(values)
              .onConflictDoUpdate({
                target: [subscriptions.environment, subscriptions.contractId],
                set: values,
              })
              .returning({ id: subscriptions.id })
          )[0];
          for (const order of state.orders) {
            const values = {
              environment,
              customerId: customerID,
              contractId: contractID,
              polarOrderId: order.id,
              subscriptionId: subscription.id,
              status: order.status,
              netAmount: BigInt(order.net_amount),
              taxAmount: BigInt(order.tax_amount),
              totalAmount: BigInt(order.total_amount),
              currency: order.currency.toUpperCase(),
              refundedAmount: BigInt(
                order.refunded_amount + order.refunded_tax_amount,
              ),
              reconciledAt: new Date(),
            };
            await tx
              .insert(orders)
              .values(values)
              .onConflictDoUpdate({
                target: [orders.environment, orders.polarOrderId],
                set: values,
              });
          }
          if (state.initialPaid)
            await tx
              .update(checkouts)
              .set({
                state: ["withdrawn", "ended", "paid_needs_review"].includes(
                  contract.state,
                )
                  ? "paid_needs_review"
                  : "paid",
                updatedAt: new Date(),
              })
              .where(eq(checkouts.id, attempt.id));
          for (const change of initial.changes.filter(
            (value) => value.contractId === contractID,
          )) {
            if (
              change.direction === "downgrade" &&
              change.status === "scheduled" &&
              ["canceled", "unpaid"].includes(state.status)
            ) {
              await tx
                .update(changes)
                .set({
                  status: "failed",
                  errorCode: "subscription_ended",
                  leaseUntil: null,
                })
                .where(
                  and(
                    eq(changes.id, change.id),
                    eq(changes.status, "scheduled"),
                  ),
                );
              continue;
            }
            if (appliedChanges.get(contractID) === change.id)
              await tx
                .update(changes)
                .set({
                  status: "applied",
                  appliedAt: change.appliedAt || new Date(),
                  errorCode: null,
                  leaseUntil: null,
                })
                .where(
                  and(
                    eq(changes.id, change.id),
                    sql`${changes.status}<>'failed'`,
                  ),
                );
            else if (
              scheduledChanges.has(change.id) &&
              change.status !== "applied"
            )
              await tx
                .update(changes)
                .set({
                  status: "scheduled",
                  effectiveAt: scheduledChanges.get(change.id),
                  errorCode: null,
                })
                .where(
                  and(
                    eq(changes.id, change.id),
                    sql`${changes.status}<>'failed'`,
                  ),
                );
          }
          if (
            initial.releases.some(
              (release) => release.contractID === contractID,
            ) &&
            state.status === "active"
          )
            reviews.add("billing_active_after_manual_release");
          if (
            contract.state === "ended" &&
            state.initialPaid &&
            state.status === "active"
          )
            reviews.add("ended_agreement_active");
          if (environment === "live")
            await tx.execute(
              sql`SELECT webdock_rls.project_billing_contract(${customerID},${contractID})`,
            );
          else {
            let next = contract.serviceStatus,
              contractState = contract.state;
            if (
              ["withdrawn", "ended", "paid_needs_review"].includes(
                contract.state,
              ) &&
              state.initialPaid &&
              state.status === "active"
            )
              contractState = "paid_needs_review";
            else if (state.initialPaid && state.status === "active") {
              next = "active";
              contractState = "active";
            } else if (
              contract.projectedAt &&
              ["canceled", "unpaid"].includes(state.status)
            ) {
              next = "ended";
              contractState = "ended";
            } else if (contract.projectedAt && state.status === "paused") {
              next = "suspended";
              contractState = "suspended";
            } else if (contract.projectedAt && state.status === "past_due")
              next = "warning";
            await tx
              .update(contracts)
              .set({
                state: contractState,
                serviceStatus: next,
                ...(next === "active"
                  ? {
                      projectedAt: contract.projectedAt || new Date(),
                      projectedHash: createHash("sha256")
                        .update(JSON.stringify(contract.snapshot))
                        .digest("hex"),
                    }
                  : {}),
                ...(next === "ended"
                  ? { endedAt: contract.endedAt || new Date() }
                  : {}),
              })
              .where(eq(contracts.id, contractID));
          }
        }
        await tx
          .update(customers)
          .set({
            ...(customer
              ? {
                  polarCustomerId: customer.id,
                  billingEmail: customer.email ?? null,
                }
              : {}),
            reconciledAt: new Date(),
          })
          .where(
            and(
              eq(customers.environment, environment),
              eq(customers.customerId, customerID),
            ),
          );
        await requireClaim();
        return { applied: true, reviews: [...reviews] };
      });
    },
  );
}
