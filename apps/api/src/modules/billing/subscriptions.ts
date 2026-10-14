import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { withDatabaseScope } from "@webdock/database-runtime";
import { databasePools } from "../../db/runtime";
import {
  billingChange as changes,
  billingSubscription as subscriptions,
  billingContract as contracts,
  billingCustomer as customers,
  billingOffer as offers,
  billingJob as jobs,
} from "../../db/schema/billing";
import {
  customerTransaction,
  billingAudit,
  type BillingActor,
} from "./context";
import {
  BillingError,
  environmentSchema,
  type BillingEnvironment,
} from "./types";
import { recordID } from "../registry/contracts";
import { versionSchema } from "./checkout";
import { verifyPublishedProduct, type PublishedTerms } from "./catalog-policy";
import { billingWorkerProvider } from "./worker-provider";
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const inputSchema = z
  .object({
    environment: environmentSchema,
    customerID: recordID,
    subscriptionID: recordID,
    versionID: recordID,
    offerToken: z
      .string()
      .regex(/^billing\.[A-Za-z0-9_-]{43}$/)
      .optional(),
  })
  .strict();
export function changeDirection(
  current: z.infer<typeof versionSchema>,
  target: z.infer<typeof versionSchema>,
) {
  if (
    current.currency !== target.currency ||
    current.interval !== target.interval
  )
    throw new BillingError(
      "Currency or billing-interval changes require operator review.",
      409,
    );
  const before = [
      BigInt(current.amount),
      BigInt(current.entitlements.editors),
      BigInt(current.entitlements.mediaBytes),
      BigInt(current.entitlements.mailMonthly),
    ],
    after = [
      BigInt(target.amount),
      BigInt(target.entitlements.editors),
      BigInt(target.entitlements.mediaBytes),
      BigInt(target.entitlements.mailMonthly),
    ];
  if (
    before.every((value, i) => after[i] >= value) &&
    before.some((value, i) => after[i] > value)
  )
    return "upgrade";
  if (before.every((value, i) => after[i] <= value)) return "downgrade";
  throw new BillingError("Mixed service changes require operator review.", 409);
}
type Input = z.infer<typeof inputSchema>;
type Tx = Parameters<Parameters<typeof customerTransaction>[2]>[0];
async function quote(tx: Tx, input: Input) {
  const row = (
    await tx
      .select({ subscription: subscriptions, contract: contracts })
      .from(subscriptions)
      .innerJoin(contracts, eq(contracts.id, subscriptions.contractId))
      .where(
        and(
          eq(subscriptions.id, input.subscriptionID),
          eq(subscriptions.environment, input.environment),
          eq(subscriptions.customerId, input.customerID),
        ),
      )
  )[0];
  if (
    !row ||
    row.subscription.status !== "active" ||
    !row.subscription.initialOrderPaid ||
    row.subscription.cancelAtPeriodEnd ||
    row.subscription.pendingUpdate ||
    row.contract.state !== "active"
  )
    throw new BillingError(
      "An active paid subscription without a pending cancellation or change is required.",
      409,
    );
  const pending = (
    await tx
      .select({ id: changes.id })
      .from(changes)
      .where(
        and(
          eq(changes.environment, input.environment),
          eq(changes.contractId, row.contract.id),
          sql`${changes.status} NOT IN ('applied','failed')`,
        ),
      )
      .limit(1)
  )[0];
  if (pending)
    throw new BillingError(
      "Review the existing subscription change before starting another.",
      409,
    );
  const applied = (
    await tx
      .select({ snapshot: changes.snapshot })
      .from(changes)
      .where(
        and(
          eq(changes.environment, input.environment),
          eq(changes.contractId, row.contract.id),
          eq(changes.status, "applied"),
        ),
      )
      .orderBy(desc(changes.appliedAt), desc(changes.id))
      .limit(1)
  )[0];
  const current = versionSchema.parse(
    applied?.snapshot || row.contract.snapshot,
  );
  if (current.versionID === input.versionID)
    throw new BillingError("This version is already assigned.", 409);
  const offer = input.offerToken
    ? (
        await tx
          .select()
          .from(offers)
          .where(
            and(
              eq(offers.environment, input.environment),
              eq(offers.customerId, input.customerID),
              eq(
                offers.tokenHash,
                createHash("sha256").update(input.offerToken).digest("hex"),
              ),
            ),
          )
      )[0]
    : null;
  const revision =
    (
      await tx.execute<{ revision: number }>(
        sql`SELECT revision FROM webdock_auth.tenant_subscription WHERE customer_id=${input.customerID}`,
      )
    ).rows[0]?.revision ?? 0;
  if (
    input.offerToken &&
    (!offer ||
      offer.versionId !== input.versionID ||
      offer.status !== "pending" ||
      offer.expiresAt.getTime() <= Date.now() ||
      offer.expectedRevision !== revision)
  )
    throw new BillingError("This private offer is no longer available.", 409);
  const target = versionSchema.parse(
    (
      await tx.execute<{ value: unknown }>(
        sql`SELECT webdock_rls.billing_version(${input.environment},${input.versionID},${input.customerID},${offer?.id ?? null}) AS value`,
      )
    ).rows[0].value,
  );
  const config = (
    await tx.execute<{ value: { salesEnabled: boolean } | null }>(
      sql`SELECT webdock_rls.billing_sale_config(${input.environment},${input.customerID}) AS value`,
    )
  ).rows[0].value;
  if (!config?.salesEnabled)
    throw new BillingError(
      "New subscription changes are currently unavailable.",
      409,
    );
  const direction = changeDirection(current, target),
    periodEnd = row.subscription.periodEnd;
  if (!periodEnd)
    throw new BillingError("Refresh the subscription period first.", 409);
  const termsHash = digest({
    environment: input.environment,
    customerID: input.customerID,
    subscriptionID: input.subscriptionID,
    fromProductID: row.subscription.polarProductId,
    targetHash: target.termsHash,
    periodEnd: periodEnd.toISOString(),
    revision,
    offerID: offer?.id ?? null,
  });
  return { ...row, current, target, direction, periodEnd, termsHash, offer };
}
export async function quoteSubscriptionChange(
  actor: BillingActor,
  raw: unknown,
) {
  const input = inputSchema.parse(raw);
  return customerTransaction(actor, input.customerID, async (tx) => {
    const q = await quote(tx, input);
    return {
      current: q.current,
      target: q.target,
      direction: q.direction,
      periodEnd: q.periodEnd.toISOString(),
      termsHash: q.termsHash,
      operationID: randomUUID(),
    };
  });
}
type Provider = {
  organizationID: string;
  product: (id: string) => Promise<unknown>;
  get: (id: string) => Promise<unknown>;
  orders: (id: string) => Promise<{ id: string; status: string }[]>;
  update: (
    id: string,
    productID: string,
    mode: "invoice" | "next_period",
    metadata: Record<string, string>,
  ) => Promise<unknown>;
};
async function provider(environment: BillingEnvironment): Promise<Provider> {
  const { polar, organizationID } = await billingWorkerProvider(environment);
  return {
    organizationID,
    product: (id) => polar.products.get(id),
    get: (id) => polar.subscriptions.get(id),
    orders: async (subscription_id) => {
      const all: { id: string; status: string }[] = [];
      for await (const order of polar.orders.iterList({
        organization_id: organizationID,
        subscription_id,
        limit: 100,
      })) {
        if (all.length >= 10000)
          throw new BillingError("Invoice inventory is incomplete.", 502);
        all.push({ id: order.id, status: order.status });
      }
      return all;
    },
    update: (id, product_id, proration_behavior, metadata) =>
      polar.subscriptions.update(id, {
        product_id,
        proration_behavior,
        metadata,
      }),
  };
}
const remoteSchema = z
  .object({
    id: z.uuid(),
    customer_id: z.uuid(),
    product_id: z.uuid(),
    customer: z.object({
      id: z.uuid(),
      organization_id: z.uuid(),
      external_id: z.string().nullable().optional(),
    }),
    product: z.object({ organization_id: z.uuid() }),
    status: z.string(),
    cancel_at_period_end: z.boolean(),
    pause_at_period_end: z.boolean().optional(),
    current_period_end: z.iso.datetime({ offset: true }),
    metadata: z.record(z.string(), z.unknown()),
    pending_update: z
      .object({
        product_id: z.uuid().nullable(),
        applies_at: z.iso.datetime({ offset: true }),
      })
      .passthrough()
      .nullable(),
  })
  .passthrough();
export async function changeSubscription(
  actor: BillingActor,
  raw: unknown,
  factory: (environment: BillingEnvironment) => Promise<Provider> = provider,
) {
  const input = inputSchema
    .extend({
      operationID: z.uuid(),
      termsHash: z.string().regex(/^[a-f0-9]{64}$/),
      acceptTerms: z.literal(true),
    })
    .parse(raw);
  const saved = await customerTransaction(
    actor,
    input.customerID,
    async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${"plan:" + input.customerID},0))`,
      );
      const old = (
        await tx
          .select()
          .from(changes)
          .where(
            and(
              eq(changes.environment, input.environment),
              eq(changes.operationId, input.operationID),
            ),
          )
          .for("update")
      )[0];
      if (old) {
        if (
          old.subscriptionId !== input.subscriptionID ||
          old.versionId !== input.versionID ||
          old.termsHash !== input.termsHash
        )
          throw new BillingError("Subscription change identity differs.", 409);
        return old;
      }
      const q = await quote(tx, input);
      if (q.termsHash !== input.termsHash)
        throw new BillingError(
          "Subscription terms changed. Review them again.",
          409,
        );
      const added = (
        await tx
          .insert(changes)
          .values({
            environment: input.environment,
            customerId: input.customerID,
            contractId: q.contract.id,
            subscriptionId: q.subscription.id,
            versionId: input.versionID,
            operationId: input.operationID,
            fromProductId: q.subscription.polarProductId,
            direction: q.direction,
            snapshot: q.target,
            termsHash: q.termsHash,
            offerId: q.offer?.id ?? null,
            periodEnd: q.periodEnd,
            acceptedBy: actor.subject,
          })
          .returning()
      )[0];
      await tx
        .update(customers)
        .set({ generation: sql`${customers.generation}+1` })
        .where(
          and(
            eq(customers.environment, input.environment),
            eq(customers.customerId, input.customerID),
          ),
        );
      if (q.offer)
        await tx
          .update(offers)
          .set({
            status: "accepted",
            contractId: q.contract.id,
            acceptedBy: actor.subject,
            acceptedAt: new Date(),
          })
          .where(eq(offers.id, q.offer.id));
      await billingAudit(tx, actor, "subscription-change-accepted", added.id);
      return added;
    },
  );
  if (saved.status === "applied")
    return { changeID: saved.id, state: saved.status };
  await customerTransaction(actor, input.customerID, async () => {});
  const result = await withDatabaseScope(
    {
      kind: "system",
      purpose: `polar:${input.environment}:customer`,
      customerID: input.customerID,
    },
    async () => {
      const target = versionSchema.parse(saved.snapshot),
        client = await factory(input.environment),
        stored = (
          await databasePools.workerOrm
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.id, saved.subscriptionId))
        )[0];
      if (!stored) throw new BillingError("Subscription unavailable.", 404);
      let sent = false,
        ownedToken: string | undefined;
      try {
        let current = remoteSchema.parse(
          await client.get(stored.polarSubscriptionId),
        );
        const storedCustomer = (
          await databasePools.workerOrm
            .select({ id: customers.polarCustomerId })
            .from(customers)
            .where(
              and(
                eq(customers.environment, input.environment),
                eq(customers.customerId, input.customerID),
              ),
            )
        )[0];
        const verifyIdentity = () => {
          if (
            !storedCustomer?.id ||
            current.id !== stored.polarSubscriptionId ||
            current.customer_id !== storedCustomer.id ||
            current.customer.id !== storedCustomer.id ||
            current.customer.organization_id !== client.organizationID ||
            current.product.organization_id !== client.organizationID ||
            current.customer.external_id !== "webdock:" + input.customerID
          )
            throw new BillingError(
              "Subscription customer or organization differs.",
              409,
            );
        };
        verifyIdentity();
        const matches = () =>
          current.metadata.webdock_change_id === saved.id &&
          current.metadata.webdock_operation_id === saved.operationId &&
          (current.product_id === target.productID ||
            current.pending_update?.product_id === target.productID);
        if (!matches()) {
          if (saved.status !== "reserved") {
            if (
              saved.status === "changing" &&
              saved.leaseUntil &&
              saved.leaseUntil.getTime() > Date.now()
            )
              return { changeID: saved.id, state: "changing" };
            throw new BillingError(
              "The existing subscription update is unresolved. Review it before another update.",
              409,
            );
          }
          if (
            current.product_id !== saved.fromProductId ||
            current.status !== "active" ||
            current.cancel_at_period_end ||
            current.pause_at_period_end ||
            Date.parse(current.current_period_end) !==
              saved.periodEnd.getTime() ||
            current.pending_update
          )
            throw new BillingError(
              "The provider subscription changed. Review it again.",
              409,
            );
          const expected = (
            await withDatabaseScope(
              { kind: "system", purpose: `polar:${input.environment}:catalog` },
              () =>
                databasePools.worker.query(
                  "SELECT webdock_rls.billing_catalog_terms($1,$2) AS value",
                  [input.environment, target.productID],
                ),
            )
          ).rows[0]?.value as PublishedTerms | undefined;
          if (
            !expected ||
            expected.versionID !== saved.versionId ||
            expected.organizationID !== client.organizationID
          )
            throw new BillingError("Target product requires review.", 409);
          const product = verifyPublishedProduct(
            await client.product(target.productID),
            expected,
          );
          if (product.priceIDs[0] !== target.priceIDs[0])
            throw new BillingError(
              "Target price changed. Review it again.",
              409,
            );
          const baseline = await client.orders(stored.polarSubscriptionId);
          if (
            saved.direction === "upgrade" &&
            baseline.some((order) =>
              ["pending", "draft"].includes(order.status),
            )
          )
            throw new BillingError(
              "Resolve outstanding invoices before upgrading.",
              409,
            );
          await customerTransaction(actor, input.customerID, async () => {});
          const token = randomUUID();
          const claimed = await databasePools.workerOrm.transaction(
            async (tx) => {
              const rows = await tx
                .update(changes)
                .set({
                  status: "changing",
                  baselineOrderIds: baseline.map((row) =>
                    z.uuid().parse(row.id),
                  ),
                  claimToken: token,
                  leaseUntil: new Date(Date.now() + 60_000),
                })
                .where(
                  and(eq(changes.id, saved.id), eq(changes.status, "reserved")),
                )
                .returning({ id: changes.id });
              if (rows.length)
                await tx
                  .insert(jobs)
                  .values({
                    environment: input.environment,
                    customerId: input.customerID,
                    kind: "subscription-change",
                    dedupeKey: "change:" + saved.id,
                    status: "running",
                    claimToken: token,
                    leaseUntil: new Date(Date.now() + 60_000),
                  })
                  .onConflictDoNothing();
              return rows.length === 1;
            },
          );
          if (!claimed) return { changeID: saved.id, state: "changing" };
          ownedToken = token;
          sent = true;
          await client.update(
            stored.polarSubscriptionId,
            target.productID,
            saved.direction === "upgrade" ? "invoice" : "next_period",
            {
              webdock_contract_id: saved.contractId,
              webdock_change_id: saved.id,
              webdock_operation_id: saved.operationId,
            },
          );
          current = remoteSchema.parse(
            await client.get(stored.polarSubscriptionId),
          );
          verifyIdentity();
          if (!matches())
            throw new BillingError(
              "Provider update could not be confirmed.",
              409,
            );
        }
        const scheduled = current.product_id !== target.productID,
          effectiveAt = scheduled
            ? new Date(current.pending_update!.applies_at)
            : null;
        if (
          saved.direction === "downgrade" &&
          scheduled &&
          effectiveAt!.getTime() !== saved.periodEnd.getTime()
        )
          throw new BillingError(
            "The scheduled change date differs from the accepted period.",
            409,
          );
        await databasePools.workerOrm.transaction(async (tx) => {
          await tx
            .update(changes)
            .set({
              status: scheduled ? "scheduled" : "awaiting_payment",
              effectiveAt,
              leaseUntil: null,
              errorCode: null,
            })
            .where(
              and(
                eq(changes.id, saved.id),
                sql`${changes.status} NOT IN ('applied','failed')`,
              ),
            );
          await tx
            .update(jobs)
            .set({
              status: "succeeded",
              finishedAt: new Date(),
              leaseUntil: null,
            })
            .where(
              and(
                eq(jobs.environment, input.environment),
                eq(jobs.dedupeKey, "change:" + saved.id),
              ),
            );
          await tx
            .insert(jobs)
            .values({
              environment: input.environment,
              customerId: input.customerID,
              kind: "reconcile",
              dedupeKey: "change-read:" + saved.id,
            })
            .onConflictDoNothing();
          if (effectiveAt)
            await tx
              .insert(jobs)
              .values({
                environment: input.environment,
                customerId: input.customerID,
                kind: "reconcile",
                dedupeKey: "change-effective:" + saved.id,
                availableAt: effectiveAt,
              })
              .onConflictDoNothing();
        });
        return {
          changeID: saved.id,
          state: scheduled ? "scheduled" : "awaiting_payment",
        };
      } catch (error) {
        const failureState =
          !sent && saved.status === "reserved" ? "failed" : "needs_review";
        await databasePools.workerOrm
          .update(changes)
          .set({
            status: failureState,
            errorCode: "subscription_update_unconfirmed",
            leaseUntil: null,
          })
          .where(
            and(
              eq(changes.id, saved.id),
              eq(changes.status, sent ? "changing" : saved.status),
              ...(ownedToken ? [eq(changes.claimToken, ownedToken)] : []),
              sql`${changes.status} NOT IN ('applied','failed')`,
            ),
          );
        if (error instanceof BillingError) throw error;
        throw new BillingError(
          "The subscription update could not be confirmed. Review the existing update before retrying.",
          502,
        );
      }
    },
  );
  await customerTransaction(actor, input.customerID, async () => {});
  return result;
}
export async function resumeSubscriptionChange(
  actor: BillingActor,
  raw: unknown,
) {
  const input = z
    .object({
      environment: environmentSchema,
      customerID: recordID,
      changeID: recordID,
    })
    .strict()
    .parse(raw);
  const change = await customerTransaction(
    actor,
    input.customerID,
    async (tx) =>
      (
        await tx
          .select()
          .from(changes)
          .where(
            and(
              eq(changes.id, input.changeID),
              eq(changes.environment, input.environment),
              eq(changes.customerId, input.customerID),
            ),
          )
      )[0],
  );
  if (!change) throw new BillingError("Subscription change unavailable.", 404);
  return changeSubscription(actor, {
    environment: input.environment,
    customerID: input.customerID,
    subscriptionID: change.subscriptionId,
    versionID: change.versionId,
    operationID: change.operationId,
    termsHash: change.termsHash,
    acceptTerms: true,
  });
}
