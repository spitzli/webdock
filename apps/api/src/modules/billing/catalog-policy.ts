import { z } from "zod";
import { BillingError } from "./types";
export type PublishedTerms = {
  organizationID: string;
  versionID: string;
  operationID: string;
  sku: string;
  hash: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  taxBehavior: string;
  interval: string;
  visibility: string;
};
const price = z.object({
  id: z.uuid(),
  product_id: z.uuid(),
  source: z.literal("catalog"),
  amount_type: z.literal("fixed"),
  price_amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  price_currency: z.string(),
  tax_behavior: z.enum(["inclusive", "exclusive"]),
  is_archived: z.literal(false),
});
const product = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  name: z.string(),
  description: z.string(),
  is_archived: z.literal(false),
  is_recurring: z.boolean(),
  recurring_interval: z.enum(["month", "year"]).nullable(),
  recurring_interval_count: z.literal(1).nullable(),
  trial_interval: z.null(),
  trial_interval_count: z.null(),
  visibility: z.enum(["public", "private"]),
  metadata: z.record(z.string(), z.unknown()),
  prices: z.array(price).length(1),
});
export function verifyPublishedProduct(raw: unknown, expected: PublishedTerms) {
  const result = product.safeParse(raw);
  if (!result.success)
    throw new BillingError("Published product requires review.", 409);
  const row = result.data,
    p = row.prices[0],
    metadata = row.metadata;
  if (
    row.organization_id !== expected.organizationID ||
    row.name !== expected.name ||
    row.description !== expected.description ||
    row.is_recurring !== (expected.interval !== "once") ||
    row.recurring_interval !==
      (expected.interval === "once" ? null : expected.interval) ||
    row.recurring_interval_count !==
      (expected.interval === "once" ? null : 1) ||
    row.visibility !== expected.visibility ||
    p.product_id !== row.id ||
    p.price_amount !== expected.amount ||
    p.price_currency.toUpperCase() !== expected.currency ||
    p.tax_behavior !== expected.taxBehavior ||
    metadata.webdock_sku !== expected.sku ||
    metadata.webdock_version_id !== expected.versionID ||
    metadata.webdock_operation_id !== expected.operationID ||
    metadata.webdock_hash !== expected.hash
  )
    throw new BillingError(
      "Published product differs from the approved version.",
      409,
    );
  return { productID: row.id, priceIDs: [p.id] };
}
