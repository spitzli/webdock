import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { withDatabaseScope } from "@webdock/database-runtime";
import type { PlatformDatabaseRuntime } from "@webdock/platform-db/types";
import {
  billingCustomer as customers,
  billingContract as contracts,
  billingCheckout as checkouts,
  billingOffer as offers,
  billingJob as jobs,
} from "@webdock/platform-db/schema/billing";
import type { createBillingContext } from "./context";
import type { BillingActor } from "./context";
import {
  BillingError,
  environmentSchema,
  entitlementsSchema,
  type BillingEnvironment,
} from "./types";
import { recordID } from "@webdock/platform-db/ids";
import type { createBillingWorkerProvider } from "./worker-provider";
import type { createBillingCrypto } from "./crypto";
import { verifyCheckout, type CheckoutTerms } from "./checkout-policy";

/** Explicit composition retains existing operation journals, scopes and provider uncertainty fences. */
export function createBillingCheckout(dependencies: {
  requireBilling: (intent?: "access" | "provision") => void;
  databasePools: Pick<PlatformDatabaseRuntime, "workerOrm" | "worker">;
  customerTransaction: ReturnType<
    typeof createBillingContext
  >["customerTransaction"];
  billingAudit: ReturnType<typeof createBillingContext>["billingAudit"];
  billingWorkerProvider: ReturnType<
    typeof createBillingWorkerProvider
  >["billingWorkerProvider"];
  openBilling: ReturnType<typeof createBillingCrypto>["openBilling"];
  sealBilling: ReturnType<typeof createBillingCrypto>["sealBilling"];
  studioOriginSetting: () => string | undefined;
  production: () => boolean;
}) {
  const {
    requireBilling,
    databasePools,
    customerTransaction,
    billingAudit,
    billingWorkerProvider,
    openBilling,
    sealBilling,
    studioOriginSetting,
    production,
  } = dependencies;

  const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");

  const purchaseInput = z
    .object({
      environment: environmentSchema,
      customerID: recordID,
      versionID: recordID,
      projectID: recordID,
      bindingID: recordID,
      offerToken: z
        .string()
        .regex(/^billing\.[A-Za-z0-9_-]{43}$/)
        .optional(),
    })
    .strict();

  const versionSchema = z.object({
    versionID: recordID,
    productID: z.uuid(),
    priceIDs: z.array(z.uuid()).length(1),
    name: z.string(),
    description: z.string(),
    terms: z.string().min(1),
    amount: z
      .string()
      .regex(/^[1-9]\d*$/)
      .refine((value) => BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER)),
    currency: z.enum(["EUR", "CHF"]),
    taxBehavior: z.enum(["inclusive", "exclusive"]),
    interval: z.enum(["month", "year"]),
    entitlements: entitlementsSchema,
    termsHash: z.string().regex(/^[a-f0-9]{64}$/),
  });

  function studioOrigin() {
    const url = new URL(studioOriginSetting() || "");
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(
          !production() &&
          ["localhost", "127.0.0.1"].includes(url.hostname) &&
          url.protocol === "http:"
        ))
    )
      throw new BillingError("Studio origin is not configured.", 503);
    return url.origin;
  }

  type Purchase = z.infer<typeof purchaseInput>;

  type Tx = Parameters<Parameters<typeof customerTransaction>[2]>[0];

  async function quote(tx: Tx, input: Purchase) {
    const offer = input.offerToken
      ? (
          await tx
            .select()
            .from(offers)
            .where(
              and(
                eq(offers.environment, input.environment),
                eq(offers.customerId, input.customerID),
                eq(offers.tokenHash, digest(input.offerToken)),
              ),
            )
        )[0]
      : null;
    if (input.offerToken && (!offer || offer.versionId !== input.versionID))
      throw new BillingError("Offer unavailable.", 404);
    const version = versionSchema.parse(
      (
        await tx.execute<{ value: unknown }>(
          sql`SELECT webdock_rls.billing_version(${input.environment},${input.versionID},${input.customerID},${offer?.id ?? null}) AS value`,
        )
      ).rows[0].value,
    );
    const site = (
      await tx.execute<{
        value: { organizationID: string; name: string } | null;
      }>(
        sql`SELECT webdock_rls.billing_site(${input.customerID},${input.projectID},${input.bindingID},${studioOrigin() + "/sites/" + input.bindingID}) AS value`,
      )
    ).rows[0].value;
    if (!site)
      throw new BillingError(
        "A ready managed website belonging to this customer is required.",
        409,
      );
    const config = (
      await tx.execute<{
        value: {
          organizationID: string;
          salesEnabled: boolean;
          endpointID: string | null;
        } | null;
      }>(
        sql`SELECT webdock_rls.billing_sale_config(${input.environment},${input.customerID}) AS value`,
      )
    ).rows[0].value;
    const previous =
      (
        await tx.execute<{
          revision: number;
          base: unknown;
          name: string;
          description: string;
          plan_id: string | null;
        }>(
          sql`SELECT revision,base,name,description,plan_id FROM webdock_auth.tenant_subscription WHERE customer_id=${input.customerID}`,
        )
      ).rows[0] ?? null;
    const status = offer
      ? offer.status !== "pending"
        ? offer.status
        : new Date(offer.expiresAt).getTime() <= Date.now()
          ? "expired"
          : offer.expectedRevision !== (previous?.revision ?? 0)
            ? "stale"
            : "pending"
      : "pending";
    const termsHash = digest(
      JSON.stringify({
        environment: input.environment,
        customerID: input.customerID,
        versionHash: version.termsHash,
        projectID: input.projectID,
        bindingID: input.bindingID,
        revision: previous?.revision ?? 0,
        offerID: offer?.id ?? null,
      }),
    );
    return { version, site, config, previous, offer, status, termsHash };
  }

  async function quotePurchase(actor: BillingActor, raw: unknown) {
    const input = purchaseInput.parse(raw);
    return customerTransaction(actor, input.customerID, async (tx) => {
      const value = await quote(tx, input);
      return {
        ...value.version,
        termsHash: value.termsHash,
        siteName: value.site.name,
        subscriptionRevision: value.previous?.revision ?? 0,
        status: value.status,
        canAccept:
          value.config?.salesEnabled === true &&
          !!value.config.endpointID &&
          value.status === "pending",
      };
    });
  }

  type Provider = {
    find: (terms: CheckoutTerms) => Promise<unknown[]>;
    create: (terms: CheckoutTerms) => Promise<{ id: string }>;
    get: (id: string) => Promise<unknown>;
  };

  async function provider(environment: BillingEnvironment): Promise<Provider> {
    const { polar } = await billingWorkerProvider(environment);
    return {
      find: async (terms) => {
        const found: unknown[] = [];
        let count = 0;
        for await (const row of polar.checkouts.iterList({
          organization_id: terms.organizationID,
          external_customer_id: "webdock:" + terms.customerID,
          limit: 100,
        })) {
          if (++count > 10000)
            throw new BillingError("Checkout inventory is incomplete.", 502);
          if (row.metadata.webdock_operation_id === terms.operationID)
            found.push(row);
        }
        return found;
      },
      create: (terms) =>
        polar.checkouts.create({
          products: [terms.productID],
          external_customer_id: "webdock:" + terms.customerID,
          ...(terms.polarCustomerID
            ? { customer_id: terms.polarCustomerID }
            : {}),
          allow_trial: false,
          allow_discount_codes: false,
          discount_id: null,
          success_url: terms.successURL,
          return_url: terms.returnURL,
          metadata: {
            webdock_contract_id: terms.contractID,
            webdock_operation_id: terms.operationID,
          },
        }),
      get: (id) => polar.checkouts.get(id),
    };
  }

  const acceptanceSchema = purchaseInput.extend({
    termsHash: z.string().regex(/^[a-f0-9]{64}$/),
    acceptTerms: z.literal(true),
  });

  function storedCheckoutTerms(
    environment: BillingEnvironment,
    customerID: string,
    contract: { id: string; snapshot: unknown },
    attempt: {
      id: string;
      operationId: string;
      expectedCustomerId: string | null;
    },
  ): CheckoutTerms {
    const snapshot = versionSchema
        .extend({
          polarOrganizationID: z.uuid(),
          checkoutReturnVersion: z.literal(1).optional(),
        })
        .parse(contract.snapshot),
      path = studioOrigin() + "/tenants/" + customerID + "/billing";
    return {
      environment,
      organizationID: snapshot.polarOrganizationID,
      customerID,
      contractID: contract.id,
      operationID: attempt.operationId,
      productID: snapshot.productID,
      priceID: snapshot.priceIDs[0],
      amount: Number(snapshot.amount),
      currency: snapshot.currency,
      taxBehavior: snapshot.taxBehavior,
      interval: snapshot.interval,
      successURL:
        snapshot.checkoutReturnVersion === 1
          ? studioOrigin() +
            "/api/billing/return?environment=" +
            environment +
            "&customerID=" +
            customerID +
            "&attemptID=" +
            attempt.id
          : path + "?attempt=" + attempt.id,
      returnURL:
        snapshot.checkoutReturnVersion === 1
          ? path + "?environment=" + environment
          : path,
      polarCustomerID: attempt.expectedCustomerId,
    };
  }

  async function createCheckout(
    actor: BillingActor,
    raw: unknown,
    factory: (environment: BillingEnvironment) => Promise<Provider> = provider,
  ) {
    requireBilling("provision");
    const input = acceptanceSchema.parse(raw);
    const reserved = await customerTransaction(
      actor,
      input.customerID,
      async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${"plan:" + input.customerID},0))`,
        );
        const existing = (
          await tx
            .select()
            .from(contracts)
            .where(
              and(
                eq(contracts.environment, input.environment),
                eq(contracts.customerId, input.customerID),
                sql`${contracts.state}<>'ended'`,
              ),
            )
            .for("update")
        )[0];
        if (existing) {
          if (
            existing.versionId !== input.versionID ||
            existing.projectId !== input.projectID ||
            existing.bindingId !== input.bindingID ||
            existing.termsHash !== input.termsHash
          )
            throw new BillingError(
              "This customer already has a website agreement. Use its subscription settings.",
              409,
            );
          const attempt = (
            await tx
              .select()
              .from(checkouts)
              .where(
                and(
                  eq(checkouts.environment, input.environment),
                  eq(checkouts.contractId, existing.id),
                ),
              )
          )[0];
          if (!attempt)
            throw new BillingError(
              "The existing agreement requires review.",
              409,
            );
          return { contract: existing, attempt, newAttempt: false };
        }
        const current = await quote(tx, input);
        if (
          current.termsHash !== input.termsHash ||
          current.status !== "pending"
        )
          throw new BillingError(
            "The offer or terms changed. Review them again.",
            409,
          );
        if (!current.config?.salesEnabled || !current.config.endpointID)
          throw new BillingError(
            "New purchases are currently unavailable.",
            409,
          );
        await tx
          .insert(customers)
          .values({
            environment: input.environment,
            customerId: input.customerID,
            isTest: input.environment === "sandbox",
          })
          .onConflictDoNothing();
        const customer = (
          await tx
            .select()
            .from(customers)
            .where(
              and(
                eq(customers.environment, input.environment),
                eq(customers.customerId, input.customerID),
              ),
            )
            .for("update")
        )[0];
        const contract = (
          await tx
            .insert(contracts)
            .values({
              environment: input.environment,
              customerId: input.customerID,
              versionId: input.versionID,
              organizationId: current.site.organizationID,
              bindingId: input.bindingID,
              projectId: input.projectID,
              snapshot: {
                ...current.version,
                polarOrganizationID: current.config.organizationID,
                checkoutReturnVersion: 1,
                subscriptionRevision: current.previous?.revision ?? 0,
              },
              previousBase: current.previous,
              termsHash: current.termsHash,
              offerId: current.offer?.id ?? null,
              acceptedBy: actor.subject,
            })
            .returning()
        )[0];
        const attempt = (
          await tx
            .insert(checkouts)
            .values({
              environment: input.environment,
              customerId: input.customerID,
              contractId: contract.id,
              operationId: randomUUID(),
              expectedProductId: current.version.productID,
              expectedCustomerId: customer.polarCustomerId,
              amount: BigInt(current.version.amount),
              currency: current.version.currency,
              state: "creating",
            })
            .returning()
        )[0];
        await tx.execute(
          sql`SELECT webdock_rls.billing_checkout_job(${input.environment},${attempt.id})`,
        );
        if (current.offer)
          await tx
            .update(offers)
            .set({
              status: "accepted",
              acceptedAt: new Date(),
              acceptedBy: actor.subject,
              contractId: contract.id,
            })
            .where(eq(offers.id, current.offer.id));
        await billingAudit(tx, actor, "agreement-accepted", contract.id);
        return { contract, attempt, newAttempt: true };
      },
    );
    const result = () =>
      customerTransaction(actor, input.customerID, async (tx) => {
        const row = (
          await tx
            .select()
            .from(checkouts)
            .where(eq(checkouts.id, reserved.attempt.id))
        )[0];
        if (!row) throw new BillingError("Checkout unavailable.", 404);
        let url: string | undefined;
        if (
          row.encryptedUrl &&
          row.state === "open" &&
          row.expiresAt &&
          row.expiresAt.getTime() > Date.now()
        ) {
          const link = openBilling<{
            url: string;
            customerID: string;
            attemptID: string;
          }>(row.encryptedUrl, input.environment, "checkout", 1);
          if (link.customerID !== input.customerID || link.attemptID !== row.id)
            throw new BillingError("Stored checkout requires review.", 409);
          url = link.url;
        }
        return {
          attemptID: row.id,
          state: row.state,
          ...(url ? { url } : {}),
          expiresAt: row.expiresAt?.toISOString() ?? null,
        };
      });
    if (
      ["open", "paid", "expired", "failed", "paid_needs_review"].includes(
        reserved.attempt.state,
      ) ||
      (!reserved.newAttempt &&
        ["creating", "reserved"].includes(reserved.attempt.state) &&
        reserved.attempt.updatedAt.getTime() > Date.now() - 60_000)
    )
      return result();
    const terms = storedCheckoutTerms(
      input.environment,
      input.customerID,
      reserved.contract,
      reserved.attempt,
    );
    await customerTransaction(actor, input.customerID, async () => {});
    await withDatabaseScope(
      {
        kind: "system",
        purpose: `polar:${input.environment}:customer`,
        customerID: input.customerID,
      },
      async () => {
        try {
          const client = await factory(input.environment),
            matches = await client.find(terms);
          if (matches.length > 1)
            throw new BillingError(
              "Multiple matching checkouts require review.",
              409,
            );
          let remote = matches[0];
          if (!remote) {
            if (!reserved.newAttempt)
              throw new BillingError(
                "The existing checkout operation is unresolved. Review it before retrying.",
                409,
              );
            const created = await client.create(terms);
            remote = await client.get(z.uuid().parse(created.id));
          } else
            remote = await client.get(
              z.object({ id: z.uuid() }).parse(remote).id,
            );
          const verified = verifyCheckout(remote, terms);
          await databasePools.workerOrm.transaction(async (tx) => {
            const row = (
              await tx
                .select()
                .from(checkouts)
                .where(eq(checkouts.id, reserved.attempt.id))
                .for("update")
            )[0];
            if (
              !row ||
              row.operationId !== terms.operationID ||
              (row.polarCheckoutId && row.polarCheckoutId !== verified.id)
            )
              throw new BillingError("Checkout ownership changed.", 409);
            if (!["paid", "paid_needs_review"].includes(row.state))
              await tx
                .update(checkouts)
                .set({
                  polarCheckoutId: verified.id,
                  encryptedUrl: sealBilling(
                    {
                      url: verified.url,
                      customerID: input.customerID,
                      attemptID: row.id,
                    },
                    input.environment,
                    "checkout",
                    1,
                  ),
                  expiresAt: verified.expiresAt,
                  state:
                    verified.status === "expired"
                      ? "expired"
                      : verified.status === "failed"
                        ? "failed"
                        : "open",
                  updatedAt: new Date(),
                })
                .where(eq(checkouts.id, row.id));
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
                  eq(jobs.dedupeKey, "checkout:" + row.id),
                ),
              );
          });
        } catch (error) {
          await databasePools.worker.query(
            "UPDATE webdock_auth.billing_checkout SET state='needs_review',updated_at=now() WHERE environment=$1 AND id=$2 AND state IN ('creating','reserved','needs_review')",
            [input.environment, reserved.attempt.id],
          );
          await databasePools.worker.query(
            "UPDATE webdock_auth.billing_job SET status='needs_review',error_code='checkout_unconfirmed',lease_until=NULL WHERE environment=$1 AND dedupe_key=$2 AND status<>'succeeded'",
            [input.environment, "checkout:" + reserved.attempt.id],
          );
          if (error instanceof BillingError) throw error;
          throw new BillingError(
            "Checkout could not be confirmed. Review the existing attempt before trying again.",
            502,
          );
        }
      },
    );
    return result();
  }
  return { versionSchema, quotePurchase, storedCheckoutTerms, createCheckout };
}
