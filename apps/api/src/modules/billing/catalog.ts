import { randomUUID, createHash } from "node:crypto";
import { and, eq, sql, desc } from "drizzle-orm";
import { z } from "zod";
import {
  billingProduct as products,
  billingProductVersion as versions,
  billingProductMapping as mappings,
  billingConnection as connections,
  billingJob as jobs,
} from "../../db/schema/billing";
import {
  operatorTransaction,
  billingAudit,
  type BillingActor,
} from "./context";
import {
  BillingError,
  environmentSchema,
  type BillingEnvironment,
} from "./types";
import { openBilling } from "./crypto";
import { billingPolar } from "./polar";
import { verifyPublishedProduct, type PublishedTerms } from "./catalog-policy";
import { recordID } from "../registry/contracts";
const serialize = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );
import { productVersionInput } from "./catalog-input";
export { productVersionInput } from "./catalog-input";
export async function createProductVersion(actor: BillingActor, raw: unknown) {
  const input = productVersionInput.parse(raw),
    hash = createHash("sha256")
      .update(
        JSON.stringify({
          sku: input.sku,
          family: input.family,
          name: input.name,
          amount: input.amount,
          currency: input.currency,
          taxBehavior: input.taxBehavior,
          interval: input.interval,
          description: input.description,
          terms: input.terms,
          entitlements: input.entitlements,
        }),
      )
      .digest("hex");
  return operatorTransaction(actor, async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${"billing-sku:" + input.sku},0))`,
    );
    let product = (
      await tx
        .select()
        .from(products)
        .where(eq(products.sku, input.sku))
        .for("update")
    )[0];
    if (product) {
      if (product.archived)
        throw new BillingError(
          "Archived products cannot receive new versions.",
          409,
        );
      if (
        product.name !== input.name ||
        product.family !== input.family ||
        product.visibility !== input.visibility ||
        product.operationallyReady !== input.operationallyReady
      )
        throw new BillingError(
          "Use a separate SKU for different product identity or operational approval.",
          409,
        );
    } else
      product = (
        await tx
          .insert(products)
          .values({
            sku: input.sku,
            name: input.name,
            family: input.family,
            visibility: input.visibility,
            operationallyReady: input.operationallyReady,
          })
          .returning()
      )[0];
    const number =
      (
        await tx
          .select({ version: versions.version })
          .from(versions)
          .where(eq(versions.productId, product.id))
          .orderBy(desc(versions.version))
          .limit(1)
      )[0]?.version ?? 0;
    const version = (
      await tx
        .insert(versions)
        .values({
          productId: product.id,
          version: number + 1,
          amount: input.amount === null ? null : BigInt(input.amount),
          currency: input.currency,
          taxBehavior: input.taxBehavior,
          interval: input.interval,
          description: input.description,
          termsText: input.terms,
          entitlements: input.entitlements,
          termsHash: hash,
        })
        .returning()
    )[0];
    await billingAudit(tx, actor, "version-created", version.id);
    return serialize(version);
  });
}
export async function listProducts(
  actor: BillingActor,
  environment: BillingEnvironment,
) {
  environmentSchema.parse(environment);
  return operatorTransaction(actor, async (tx) =>
    serialize(
      await tx
        .select({
          id: versions.id,
          productID: products.id,
          sku: products.sku,
          name: products.name,
          family: products.family,
          visibility: products.visibility,
          operationallyReady: products.operationallyReady,
          version: versions.version,
          amount: versions.amount,
          currency: versions.currency,
          taxBehavior: versions.taxBehavior,
          interval: versions.interval,
          description: versions.description,
          terms: versions.termsText,
          entitlements: versions.entitlements,
          termsHash: versions.termsHash,
          frozen: versions.frozen,
          status: mappings.status,
          errorCode: mappings.errorCode,
          polarProductID: mappings.polarProductId,
        })
        .from(versions)
        .innerJoin(products, eq(products.id, versions.productId))
        .leftJoin(
          mappings,
          and(
            eq(mappings.versionId, versions.id),
            eq(mappings.environment, environment),
          ),
        )
        .orderBy(desc(versions.createdAt))
        .limit(250),
    ),
  );
}
type Provider = {
  find: (terms: PublishedTerms) => Promise<unknown[]>;
  create: (terms: PublishedTerms) => Promise<unknown>;
  get: (id: string) => Promise<unknown>;
};
function provider(environment: BillingEnvironment, token: string): Provider {
  const polar = billingPolar(environment, token);
  return {
    find: async (terms) => {
      const results: unknown[] = [];
      let count = 0;
      for await (const product of polar.products.iterList({
        organization_id: terms.organizationID,
        limit: 100,
        metadata: { webdock_operation_id: terms.operationID },
      })) {
        if (++count > 10000)
          throw new BillingError("Product inventory is incomplete.", 502);
        if (product.metadata.webdock_operation_id === terms.operationID)
          results.push(product);
      }
      return results;
    },
    create: (terms) =>
      polar.products.create({
        name: terms.name,
        description: terms.description,
        // OAT writes must omit organization_id; readback still verifies ownership.
        visibility: terms.visibility as "public" | "private",
        ...(terms.interval === "once"
          ? {
              recurring_interval: null,
              recurring_interval_count: null,
            }
          : {
              recurring_interval: terms.interval as "month" | "year",
              recurring_interval_count: 1,
              trial_interval: null,
              trial_interval_count: null,
            }),
        prices: [
          {
            amount_type: "fixed",
            price_amount: terms.amount,
            price_currency: terms.currency.toLowerCase() as "eur" | "chf",
            tax_behavior: terms.taxBehavior as "inclusive" | "exclusive",
          },
        ],
        metadata: {
          webdock_sku: terms.sku,
          webdock_version_id: terms.versionID,
          webdock_operation_id: terms.operationID,
          webdock_hash: terms.hash,
        },
      }),
    get: (id) => polar.products.get(id),
  };
}
export async function publishProduct(
  actor: BillingActor,
  raw: unknown,
  factory: (env: BillingEnvironment, token: string) => Provider = provider,
) {
  const input = z
    .object({ environment: environmentSchema, versionID: recordID })
    .strict()
    .parse(raw);
  const prepared = await operatorTransaction(actor, async (tx) => {
    const connection = (
      await tx
        .select()
        .from(connections)
        .where(eq(connections.environment, input.environment))
        .for("update")
    )[0];
    if (
      !connection?.catalogPublishEnabled ||
      !connection.encryptedToken ||
      !connection.organizationId
    )
      throw new BillingError(
        "Enable catalog publication for the verified environment first.",
        409,
      );
    const row = (
      await tx
        .select({ version: versions, product: products })
        .from(versions)
        .innerJoin(products, eq(products.id, versions.productId))
        .where(eq(versions.id, input.versionID))
        .for("update")
    )[0];
    if (
      !row ||
      !row.version.termsText ||
      row.version.amount === null ||
      row.product.archived ||
      !row.product.operationallyReady ||
      row.product.visibility === "internal"
    )
      throw new BillingError(
        "This product is not operationally approved for publication.",
        409,
      );
    const old = (
      await tx
        .select()
        .from(mappings)
        .where(
          and(
            eq(mappings.environment, input.environment),
            eq(mappings.versionId, input.versionID),
          ),
        )
        .for("update")
    )[0];
    if (old?.status === "archived")
      throw new BillingError(
        "Archived product versions cannot be republished.",
        409,
      );
    if (old?.status === "ready")
      return {
        kind: "ready" as const,
        result: {
          productID: z.uuid().parse(old.polarProductId),
          priceIDs: z.array(z.uuid()).length(1).parse(old.priceIds),
        },
      };
    const operationID = old?.operationId || randomUUID(),
      claimToken = randomUUID(),
      newOperation = !old || old.status === "draft";
    const terms: PublishedTerms = {
      organizationID: connection.organizationId,
      versionID: row.version.id,
      operationID,
      sku: row.product.sku,
      hash: row.version.termsHash,
      name: row.product.name,
      description: row.version.description,
      amount: Number(row.version.amount),
      currency: row.version.currency,
      taxBehavior: row.version.taxBehavior,
      interval: row.version.interval,
      visibility: row.product.visibility,
    };
    terms.hash = createHash("sha256")
      .update(
        JSON.stringify({
          organizationID: terms.organizationID,
          versionID: terms.versionID,
          sku: terms.sku,
          name: terms.name,
          description: terms.description,
          amount: terms.amount,
          currency: terms.currency,
          taxBehavior: terms.taxBehavior,
          interval: terms.interval,
          visibility: terms.visibility,
        }),
      )
      .digest("hex");
    if (!row.version.frozen)
      await tx
        .update(versions)
        .set({ frozen: true })
        .where(eq(versions.id, input.versionID));
    await tx
      .insert(mappings)
      .values({
        environment: input.environment,
        versionId: input.versionID,
        status: "publishing",
        operationId: operationID,
        desiredHash: terms.hash,
      })
      .onConflictDoNothing();
    const job = (
      await tx
        .insert(jobs)
        .values({
          environment: input.environment,
          kind: "publish",
          dedupeKey: "publish:" + input.versionID,
          status: "running",
          claimToken,
          leaseUntil: new Date(Date.now() + 60_000),
        })
        .onConflictDoNothing()
        .returning({ id: jobs.id })
    )[0];
    await tx
      .update(connections)
      .set({ locked: true })
      .where(eq(connections.environment, input.environment));
    return {
      kind: "pending" as const,
      terms,
      token: openBilling<string>(
        connection.encryptedToken,
        input.environment,
        "token",
        connection.tokenVersion,
      ),
      newOperation: newOperation && !!job,
      claimToken,
      jobID: job?.id,
    };
  });
  if (prepared.kind === "ready") return prepared.result;
  let verified: { productID: string; priceIDs: string[] };
  try {
    const client = factory(input.environment, prepared.token),
      found = await client.find(prepared.terms);
    if (found.length > 1)
      throw new BillingError("Multiple matching products require review.", 409);
    let product: unknown = found[0];
    if (!product) {
      if (!prepared.newOperation)
        throw new BillingError(
          "The previous publication is unresolved. Review Polar before creating another product.",
          409,
        );
      // Polar reads can lag writes. Validate the complete create response instead
      // of immediately querying a replica that may still return 404.
      product = await client.create(prepared.terms);
    } else
      product = await client.get(z.object({ id: z.uuid() }).parse(product).id);
    verified = verifyPublishedProduct(product, prepared.terms);
    await operatorTransaction(actor, async (tx) => {
      const connection = (
        await tx
          .select()
          .from(connections)
          .where(eq(connections.environment, input.environment))
          .for("update")
      )[0];
      if (connection.organizationId !== prepared.terms.organizationID)
        throw new BillingError(
          "Billing organization changed during publication.",
          409,
        );
      const current = (
        await tx
          .select()
          .from(mappings)
          .where(
            and(
              eq(mappings.environment, input.environment),
              eq(mappings.versionId, input.versionID),
            ),
          )
          .for("update")
      )[0];
      if (
        !current ||
        current.operationId !== prepared.terms.operationID ||
        current.status === "archived"
      )
        throw new BillingError("Publication ownership changed.", 409);
      if (current.status === "ready") {
        if (current.polarProductId !== verified.productID)
          throw new BillingError(
            "Conflicting published product requires review.",
            409,
          );
        return;
      }
      await tx
        .update(mappings)
        .set({
          polarProductId: verified.productID,
          priceIds: verified.priceIDs,
          status: "ready",
          checkedAt: new Date(),
          errorCode: null,
        })
        .where(
          and(
            eq(mappings.environment, input.environment),
            eq(mappings.versionId, input.versionID),
            eq(mappings.operationId, prepared.terms.operationID),
          ),
        );
      await tx
        .update(jobs)
        .set({ status: "succeeded", finishedAt: new Date(), leaseUntil: null })
        .where(
          and(
            eq(jobs.environment, input.environment),
            eq(jobs.dedupeKey, "publish:" + input.versionID),
          ),
        );
      await billingAudit(
        tx,
        actor,
        "version-published",
        input.environment + ":" + input.versionID,
      );
    });
  } catch (error) {
    await operatorTransaction(actor, async (tx) => {
      await tx
        .update(mappings)
        .set({ status: "needs_review", errorCode: "publication_unconfirmed" })
        .where(
          and(
            eq(mappings.environment, input.environment),
            eq(mappings.versionId, input.versionID),
            sql`${mappings.status} NOT IN ('ready','archived')`,
          ),
        );
      await tx
        .update(jobs)
        .set({
          status: "needs_review",
          leaseUntil: null,
          errorCode: "publication_unconfirmed",
        })
        .where(
          and(
            eq(jobs.environment, input.environment),
            eq(jobs.dedupeKey, "publish:" + input.versionID),
            sql`${jobs.status}<>'succeeded'`,
          ),
        );
    }).catch(() => {});
    if (error instanceof BillingError) throw error;
    throw new BillingError(
      "Publication could not be confirmed. Review the existing operation before retrying.",
      502,
    );
  }
  return verified;
}

export async function setProductAvailability(
  actor: BillingActor,
  raw: unknown,
) {
  const input = z
    .object({
      productID: recordID,
      visibility: z.enum(["public", "private", "internal"]),
      operationallyReady: z.boolean(),
    })
    .strict()
    .parse(raw);
  return operatorTransaction(actor, async (tx) => {
    const product = (
      await tx
        .select()
        .from(products)
        .where(eq(products.id, input.productID))
        .for("update")
    )[0];
    if (!product) throw new BillingError("Product unavailable.", 404);
    if (product.visibility !== input.visibility) {
      const published = (
        await tx
          .select({ id: versions.id })
          .from(versions)
          .innerJoin(mappings, eq(mappings.versionId, versions.id))
          .where(
            and(
              eq(versions.productId, input.productID),
              sql`${mappings.status}<>'draft'`,
            ),
          )
          .limit(1)
      )[0];
      if (published)
        throw new BillingError(
          "Published visibility is fixed. Create another product for a different audience.",
          409,
        );
    }
    await tx
      .update(products)
      .set({
        visibility: input.visibility,
        operationallyReady: input.operationallyReady,
      })
      .where(eq(products.id, input.productID));
    await billingAudit(
      tx,
      actor,
      "product-availability-updated",
      input.productID,
    );
    return { productID: input.productID };
  });
}

/** Archive only: never delete a product, price, agreement or existing subscription. */
export async function archiveProduct(actor: BillingActor, raw: unknown) {
  const input = z
    .object({ environment: environmentSchema, versionID: recordID })
    .strict()
    .parse(raw);
  const prepared = await operatorTransaction(actor, async (tx) => {
    const mapping = (
      await tx
        .select()
        .from(mappings)
        .where(
          and(
            eq(mappings.environment, input.environment),
            eq(mappings.versionId, input.versionID),
          ),
        )
    )[0];
    const connection = (
      await tx
        .select()
        .from(connections)
        .where(eq(connections.environment, input.environment))
    )[0];
    if (
      !mapping?.polarProductId ||
      !["ready", "needs_review", "archived"].includes(mapping.status) ||
      !connection?.encryptedToken ||
      !connection.organizationId
    )
      throw new BillingError("Published product required for archival.", 409);
    return { mapping, connection };
  });
  const polar = billingPolar(
    input.environment,
    openBilling<string>(
      prepared.connection.encryptedToken!,
      input.environment,
      "token",
      prepared.connection.tokenVersion,
    ),
  );
  const verify = (value: unknown) => {
    const remote = z
      .object({
        id: z.uuid(),
        organization_id: z.uuid(),
        is_archived: z.boolean(),
        metadata: z.object({ webdock_version_id: z.string() }),
      })
      .parse(value);
    if (
      remote.id !== prepared.mapping.polarProductId ||
      remote.organization_id !== prepared.connection.organizationId ||
      remote.metadata.webdock_version_id !== input.versionID
    )
      throw new BillingError("Product identity requires review.", 409);
    return remote;
  };
  try {
    const remote = verify(
      await polar.products.get(prepared.mapping.polarProductId!),
    );
    const complete = await operatorTransaction(actor, async (tx) => {
      const current = (
        await tx
          .select()
          .from(mappings)
          .where(
            and(
              eq(mappings.environment, input.environment),
              eq(mappings.versionId, input.versionID),
            ),
          )
          .for("update")
      )[0];
      if (current?.polarProductId !== remote.id)
        throw new BillingError(
          "Product mapping changed. Refresh before retrying.",
          409,
        );
      if (
        current.status === "archived" &&
        !current.errorCode &&
        remote.is_archived
      )
        return true;
      await tx
        .update(mappings)
        .set({ status: "archived", errorCode: "archive_unconfirmed" })
        .where(
          and(
            eq(mappings.environment, input.environment),
            eq(mappings.versionId, input.versionID),
          ),
        );
      if (current.status !== "archived")
        await billingAudit(
          tx,
          actor,
          "version-archive-requested",
          input.versionID,
        );
      return false;
    });
    if (complete) return { status: "archived" };
    if (!remote.is_archived)
      await polar.products.update(remote.id, { is_archived: true });
    if (!verify(await polar.products.get(remote.id)).is_archived)
      throw new BillingError("Product archival is not confirmed.", 502);
    await operatorTransaction(actor, async (tx) => {
      const rows = await tx
        .update(mappings)
        .set({ errorCode: null, checkedAt: new Date() })
        .where(
          and(
            eq(mappings.environment, input.environment),
            eq(mappings.versionId, input.versionID),
            eq(mappings.polarProductId, remote.id),
            eq(mappings.status, "archived"),
            sql`${mappings.errorCode} IS NOT NULL`,
          ),
        )
        .returning({ id: mappings.versionId });
      if (rows.length)
        await billingAudit(tx, actor, "version-archived", input.versionID);
    });
    return { status: "archived" };
  } catch (error) {
    if (error instanceof BillingError) throw error;
    throw new BillingError(
      "Product archival could not be confirmed. Check the existing product before retrying.",
      502,
    );
  }
}
