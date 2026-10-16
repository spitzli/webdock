import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { withDatabaseScope } from "@webdock/database-runtime";
import type { PlatformDatabaseRuntime } from "@webdock/platform-db/types";
import {
  billingChange as changes,
  billingOffer as offers,
  billingCustomer as customers,
  billingProduct as products,
  billingProductVersion as versions,
  billingProductMapping as mappings,
  billingContract as contracts,
} from "@webdock/platform-db/schema/billing";
import type { createBillingContext } from "./context";
import type { BillingActor } from "./context";
import {
  BillingError,
  environmentSchema,
  type BillingEnvironment,
} from "./types";
import { recordID } from "@webdock/platform-db/ids";

/** Explicit composition retains existing operation journals, scopes and provider uncertainty fences. */
export function createBillingOffers(dependencies: {
  requireOperation: (operation: string, args: unknown[]) => void;
  databasePools: Pick<PlatformDatabaseRuntime, "orm">;
  operatorTransaction: ReturnType<
    typeof createBillingContext
  >["operatorTransaction"];
  customerTransaction: ReturnType<
    typeof createBillingContext
  >["customerTransaction"];
  billingAudit: ReturnType<typeof createBillingContext>["billingAudit"];
  studioOriginSetting: () => string | undefined;
}) {
  const {
    requireOperation,
    databasePools,
    operatorTransaction,
    customerTransaction,
    billingAudit,
    studioOriginSetting,
  } = dependencies;

  const tokenSchema = z.string().regex(/^billing\.[A-Za-z0-9_-]{43}$/),
    hash = (value: string) => createHash("sha256").update(value).digest("hex");

  async function enableSandboxCustomer(actor: BillingActor, raw: unknown) {
    const customerID = recordID.parse(raw);
    return operatorTransaction(actor, async (tx) => {
      if (
        !(
          await tx.execute(
            sql`SELECT id FROM webdock_admin.customers WHERE id=${customerID} AND status='active'`,
          )
        ).rows.length
      )
        throw new BillingError("Active customer required.", 404);
      await tx
        .insert(customers)
        .values({
          environment: "sandbox",
          customerId: customerID,
          isTest: true,
        })
        .onConflictDoNothing();
      await billingAudit(tx, actor, "sandbox-customer-enabled", customerID);
      return { customerID, environment: "sandbox" };
    });
  }

  async function createOffer(actor: BillingActor, raw: unknown) {
    requireOperation("billing.createOffer", [raw]);
    const input = z
        .object({
          environment: environmentSchema,
          customerID: recordID,
          versionID: recordID,
          days: z.number().int().min(1).max(30),
        })
        .strict()
        .parse(raw),
      token = "billing." + randomBytes(32).toString("base64url");
    return operatorTransaction(actor, async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${"plan:" + input.customerID},0))`,
      );
      if (
        !(
          await tx.execute(
            sql`SELECT id FROM webdock_admin.customers WHERE id=${input.customerID} AND status='active'`,
          )
        ).rows.length
      )
        throw new BillingError("Active customer required.", 404);
      const version = (
        await tx
          .select({ id: versions.id })
          .from(versions)
          .innerJoin(products, eq(products.id, versions.productId))
          .innerJoin(
            mappings,
            and(
              eq(mappings.versionId, versions.id),
              eq(mappings.environment, input.environment),
            ),
          )
          .where(
            and(
              eq(versions.id, input.versionID),
              eq(products.visibility, "private"),
              eq(products.family, "website"),
              eq(products.operationallyReady, true),
              eq(products.archived, false),
              eq(mappings.status, "ready"),
            ),
          )
      )[0];
      if (!version)
        throw new BillingError(
          "Publish a dedicated private version for this offer first.",
          409,
        );
      if (input.environment === "live")
        await tx
          .insert(customers)
          .values({
            environment: "live",
            customerId: input.customerID,
            isTest: false,
          })
          .onConflictDoNothing();
      if (
        !(
          await tx
            .select({ id: customers.customerId })
            .from(customers)
            .where(
              and(
                eq(customers.environment, input.environment),
                eq(customers.customerId, input.customerID),
              ),
            )
        )[0]
      )
        throw new BillingError(
          "Enable this customer explicitly for sandbox testing first.",
          409,
        );
      const revision =
        (
          await tx.execute<{ revision: number }>(
            sql`SELECT revision FROM webdock_auth.tenant_subscription WHERE customer_id=${input.customerID}`,
          )
        ).rows[0]?.revision ?? 0;
      const offer = (
        await tx
          .insert(offers)
          .values({
            environment: input.environment,
            customerId: input.customerID,
            versionId: input.versionID,
            tokenHash: hash(token),
            expectedRevision: revision,
            expiresAt: new Date(Date.now() + input.days * 86_400_000),
            createdBy: actor.subject,
          })
          .returning({ id: offers.id })
      )[0];
      await billingAudit(tx, actor, "offer-created", offer.id);
      return {
        id: offer.id,
        url: new URL("/offers/" + token, studioOriginSetting()!).href,
      };
    });
  }

  async function revokeOffer(actor: BillingActor, raw: unknown) {
    const id = recordID.parse(raw);
    return operatorTransaction(actor, async (tx) => {
      const offer = (
        await tx.select().from(offers).where(eq(offers.id, id)).for("update")
      )[0];
      if (!offer) throw new BillingError("Offer unavailable.", 404);
      if (offer.status !== "pending")
        throw new BillingError(
          "An accepted checkout cannot be withdrawn by deleting its offer. Review the existing agreement.",
          409,
        );
      await tx
        .update(offers)
        .set({ status: "revoked" })
        .where(eq(offers.id, id));
      await billingAudit(tx, actor, "offer-revoked", id);
      return { status: "revoked" };
    });
  }

  async function getBillingOffer(actor: BillingActor, raw: unknown) {
    const token = tokenSchema.parse(raw);
    return withDatabaseScope({ kind: "session", ...actor }, async () => {
      const row = (
        await databasePools.orm
          .select()
          .from(offers)
          .where(eq(offers.tokenHash, hash(token)))
      )[0];
      if (!row) throw new BillingError("Offer unavailable.", 404);
      return customerTransaction(actor, row.customerId, async (tx) => {
        const amendment = (
          await tx
            .select({ snapshot: changes.snapshot })
            .from(changes)
            .where(eq(changes.offerId, row.id))
        )[0];
        const contract = row.contractId
          ? (
              await tx
                .select({ snapshot: contracts.snapshot })
                .from(contracts)
                .where(eq(contracts.id, row.contractId))
            )[0]
          : null;
        const version =
          amendment?.snapshot ??
          contract?.snapshot ??
          (
            await tx.execute<{ value: unknown }>(
              sql`SELECT webdock_rls.billing_version(${row.environment},${row.versionId},${row.customerId},${row.id}) AS value`,
            )
          ).rows[0].value;
        if (!version) throw new BillingError("Offer unavailable.", 404);
        const revision =
          (
            await tx.execute<{ revision: number }>(
              sql`SELECT revision FROM webdock_auth.tenant_subscription WHERE customer_id=${row.customerId}`,
            )
          ).rows[0]?.revision ?? 0;
        const status =
          row.status !== "pending"
            ? row.status
            : row.expiresAt.getTime() <= Date.now()
              ? "expired"
              : row.expectedRevision !== revision
                ? "stale"
                : "pending";
        return {
          id: row.id,
          environment: row.environment as BillingEnvironment,
          customerID: row.customerId,
          versionID: row.versionId,
          expiresAt: row.expiresAt.toISOString(),
          status,
          version,
        };
      });
    });
  }
  return { enableSandboxCustomer, createOffer, revokeOffer, getBillingOffer };
}
