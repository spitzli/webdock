import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { billingConnection as connection } from "../../db/schema/billing";
import {
  operatorTransaction,
  billingAudit,
  type BillingActor,
} from "./context";
import { sealBilling } from "./crypto";
import {
  BillingError,
  environmentSchema,
  revisionSchema,
  type BillingEnvironment,
} from "./types";
import { probeOrganization, type OrganizationProbe } from "./polar";
const safe = {
  environment: connection.environment,
  apiVersion: connection.apiVersion,
  organizationID: connection.organizationId,
  organizationName: connection.organizationName,
  locked: connection.locked,
  tokenSuffix: connection.tokenSuffix,
  tokenVersion: connection.tokenVersion,
  tokenExpiresAt: connection.tokenExpiresAt,
  endpointID: connection.endpointId,
  webhookVersion: connection.webhookVersion,
  previousWebhookUntil: connection.previousWebhookUntil,
  salesEnabled: connection.salesEnabled,
  catalogPublishEnabled: connection.catalogPublishEnabled,
  enforcementEnabled: connection.enforcementEnabled,
  revision: connection.revision,
  checkedAt: connection.checkedAt,
  receivedAt: connection.receivedAt,
  reconciledAt: connection.reconciledAt,
  updatedAt: connection.updatedAt,
};
const serialize = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );
export async function connectionStatus(
  actor: BillingActor,
  environment: BillingEnvironment,
) {
  environmentSchema.parse(environment);
  return operatorTransaction(actor, async (tx) => {
    const row = (
      await tx
        .select(safe)
        .from(connection)
        .where(eq(connection.environment, environment))
    )[0];
    const received = (
      await tx.execute<{ received: Date | null }>(
        sql`SELECT max(received_at) AS received FROM webdock_auth.billing_webhook_event WHERE environment=${environment}`,
      )
    ).rows[0].received;
    const queue = (
      await tx.execute<{
        pending: number;
        review: number;
        oldest: Date | null;
      }>(
        sql`SELECT count(*) FILTER(WHERE status IN ('pending','running'))::integer AS pending,count(*) FILTER(WHERE status IN ('failed','needs_review'))::integer AS review,min(available_at) FILTER(WHERE status IN ('pending','running') AND available_at<=now()) AS oldest FROM webdock_auth.billing_job WHERE environment=${environment}`,
      )
    ).rows[0];
    const checked = (
      await tx.execute<{ checked: Date | null }>(
        sql`SELECT CASE WHEN count(*) FILTER(WHERE c.reconciled_at IS NULL)>0 THEN NULL ELSE min(c.reconciled_at) END AS checked FROM webdock_auth.billing_customer c WHERE c.environment=${environment} AND EXISTS(SELECT 1 FROM webdock_auth.billing_contract b WHERE b.environment=c.environment AND b.customer_id=c.customer_id AND b.state<>'ended')`,
      )
    ).rows[0].checked;
    return serialize(
      row
        ? {
            ...row,
            receivedAt: received,
            reconciledAt: checked,
            pendingJobs: queue.pending,
            reviewJobs: queue.review,
            oldestDueAt: queue.oldest,
          }
        : {
            environment,
            revision: "0",
            salesEnabled: false,
            catalogPublishEnabled: false,
            enforcementEnabled: false,
            tokenSuffix: null,
            organizationID: null,
          },
    );
  });
}
const saveSchema = z
  .object({
    environment: environmentSchema,
    revision: revisionSchema,
    token: z.string().trim().min(16).max(8192),
    tokenExpiresAt: z.iso.datetime().nullable().optional(),
  })
  .strict();
export async function saveConnection(
  actor: BillingActor,
  raw: unknown,
  probe: (
    env: BillingEnvironment,
    token: string,
  ) => Promise<OrganizationProbe> = probeOrganization,
) {
  const input = saveSchema.parse(raw);
  await operatorTransaction(actor, async () => {});
  const organization = await probe(input.environment, input.token);
  z.object({ id: z.uuid(), name: z.string().min(1).max(500) }).parse(
    organization,
  );
  await operatorTransaction(actor, async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${"billing-connection:" + input.environment},0))`,
    );
    const old = (
      await tx
        .select()
        .from(connection)
        .where(eq(connection.environment, input.environment))
        .for("update")
    )[0];
    if ((old?.revision ?? 0n) !== input.revision)
      throw new BillingError(
        "Billing settings changed. Refresh before saving.",
        409,
      );
    if (old?.organizationId && old.organizationId !== organization.id) {
      const bound = (
        await tx.execute<{ bound: boolean }>(
          sql`SELECT EXISTS(SELECT 1 FROM webdock_auth.billing_product_mapping WHERE environment=${input.environment} AND status<>'draft') OR EXISTS(SELECT 1 FROM webdock_auth.billing_customer WHERE environment=${input.environment} AND polar_customer_id IS NOT NULL) AS bound`,
        )
      ).rows[0].bound;
      if (old.locked || bound)
        throw new BillingError(
          "This environment is bound to another Polar organization.",
          409,
        );
    }
    const version = (old?.tokenVersion ?? 0) + 1;
    const values = {
      organizationId: organization.id,
      organizationName: organization.name,
      encryptedToken: sealBilling(
        input.token,
        input.environment,
        "token",
        version,
      ),
      tokenSuffix: input.token.slice(-4),
      tokenVersion: version,
      tokenExpiresAt: input.tokenExpiresAt
        ? new Date(input.tokenExpiresAt)
        : null,
      checkedAt: new Date(),
      revision: input.revision + 1n,
      updatedBy: actor.subject,
      updatedAt: new Date(),
    };
    if (old)
      await tx
        .update(connection)
        .set(values)
        .where(eq(connection.environment, input.environment));
    else
      await tx
        .insert(connection)
        .values({ ...values, environment: input.environment });
    await billingAudit(tx, actor, "connection-saved", input.environment);
  });
  return connectionStatus(actor, input.environment);
}
const switchesSchema = z
  .object({
    environment: environmentSchema,
    revision: revisionSchema,
    salesEnabled: z.boolean(),
    catalogPublishEnabled: z.boolean(),
    enforcementEnabled: z.boolean(),
  })
  .strict();
export async function updateSwitches(actor: BillingActor, raw: unknown) {
  const input = switchesSchema.parse(raw);
  if (input.environment === "sandbox" && input.enforcementEnabled)
    throw new BillingError("Sandbox cannot enforce live services.");
  return operatorTransaction(actor, async (tx) => {
    const old = (
      await tx
        .select()
        .from(connection)
        .where(eq(connection.environment, input.environment))
        .for("update")
    )[0];
    if (!old?.encryptedToken || !old.checkedAt)
      throw new BillingError("Verify the Polar connection first.", 409);
    if (old.revision !== input.revision)
      throw new BillingError(
        "Billing settings changed. Refresh before saving.",
        409,
      );
    await tx
      .update(connection)
      .set({
        salesEnabled: input.salesEnabled,
        catalogPublishEnabled: input.catalogPublishEnabled,
        enforcementEnabled: input.enforcementEnabled,
        revision: old.revision + 1n,
        updatedBy: actor.subject,
        updatedAt: new Date(),
      })
      .where(eq(connection.environment, input.environment));
    await billingAudit(tx, actor, "switches-updated", input.environment);
    return { revision: (old.revision + 1n).toString() };
  });
}
