import { z } from "zod";
import { BillingError, type BillingEnvironment } from "./types";
export type CheckoutTerms = {
  environment: BillingEnvironment;
  organizationID: string;
  customerID: string;
  contractID: string;
  operationID: string;
  productID: string;
  priceID: string;
  amount: number;
  currency: string;
  taxBehavior: string;
  interval: string;
  successURL: string;
  returnURL: string;
  polarCustomerID?: string | null;
};
export function polarCustomerURL(raw: string, environment: BillingEnvironment) {
  const url = new URL(raw);
  if (
    url.origin !==
      (environment === "sandbox"
        ? "https://sandbox.polar.sh"
        : "https://polar.sh") ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new BillingError("Polar returned an unexpected customer URL.", 502);
  return url.href;
}
const schema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  external_customer_id: z.string(),
  customer_id: z.uuid().nullable(),
  status: z.enum(["open", "confirmed", "succeeded", "expired", "failed"]),
  url: z.url(),
  expires_at: z.iso.datetime({ offset: true }),
  success_url: z.url(),
  return_url: z.url(),
  product_id: z.uuid(),
  product_price_id: z.uuid(),
  products: z.array(z.object({ id: z.uuid() })).length(1),
  product: z.object({
    id: z.uuid(),
    recurring_interval: z.enum(["year", "month"]),
    recurring_interval_count: z.literal(1),
  }),
  product_price: z.object({
    id: z.uuid(),
    product_id: z.uuid(),
    amount_type: z.literal("fixed"),
    price_amount: z.number().int(),
    price_currency: z.string(),
    tax_behavior: z.enum(["inclusive", "exclusive"]),
  }),
  allow_trial: z.literal(false),
  active_trial_interval: z.null(),
  active_trial_interval_count: z.null(),
  trial_end: z.null(),
  allow_discount_codes: z.literal(false),
  discount_id: z.null(),
  discount_amount: z.literal(0),
  metadata: z.record(z.string(), z.unknown()),
  currency: z.string(),
});
export function verifyCheckout(raw: unknown, terms: CheckoutTerms) {
  const result = schema.safeParse(raw);
  if (!result.success)
    throw new BillingError("Checkout conditions require review.", 409);
  const row = result.data,
    price = row.product_price;
  if (
    row.organization_id !== terms.organizationID ||
    row.external_customer_id !== "webdock:" + terms.customerID ||
    (terms.polarCustomerID && row.customer_id !== terms.polarCustomerID) ||
    row.product_id !== terms.productID ||
    row.products[0].id !== terms.productID ||
    row.product.id !== terms.productID ||
    row.product.recurring_interval !== terms.interval ||
    row.product_price_id !== terms.priceID ||
    price.id !== terms.priceID ||
    price.product_id !== terms.productID ||
    price.price_amount !== terms.amount ||
    price.price_currency.toUpperCase() !== terms.currency ||
    row.currency.toUpperCase() !== terms.currency ||
    price.tax_behavior !== terms.taxBehavior ||
    row.success_url !== terms.successURL ||
    row.return_url !== terms.returnURL ||
    row.metadata.webdock_contract_id !== terms.contractID ||
    row.metadata.webdock_operation_id !== terms.operationID
  )
    throw new BillingError(
      "Checkout differs from the accepted agreement.",
      409,
    );
  const url = polarCustomerURL(row.url, terms.environment);
  if (!new URL(url).pathname.startsWith("/checkout/"))
    throw new BillingError("Polar returned an unexpected checkout URL.", 502);
  return {
    id: row.id,
    url,
    expiresAt: new Date(row.expires_at),
    status: row.status,
    customerID: row.customer_id,
  };
}
