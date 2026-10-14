import { z } from "zod";
import { BillingError } from "./types";
export class BillingReviewError extends BillingError {
  constructor(readonly reason: string) {
    super("Billing requires review.", 409);
  }
}
export type SubscriptionTerms = {
  organizationID: string;
  customerID: string;
  productID: string;
  checkoutID: string;
  priceID: string;
  amount: number;
  currency: string;
  interval: string;
  taxBehavior: string;
  previouslyActivated: boolean;
  historicalProducts?: {
    productID: string;
    amount: number;
    currency: string;
    taxBehavior: string;
  }[];
  initialProduct?: {
    productID: string;
    amount: number;
    currency: string;
    taxBehavior: string;
  };
};
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  date = z.iso.datetime({ offset: true });
const price = z.object({
  id: z.uuid(),
  product_id: z.uuid(),
  amount_type: z.literal("fixed"),
  price_amount: money,
  price_currency: z.string(),
  tax_behavior: z.enum(["inclusive", "exclusive"]),
});
const subscriptionSchema = z.object({
  id: z.uuid(),
  customer_id: z.uuid(),
  product_id: z.uuid(),
  checkout_id: z.uuid(),
  customer: z.object({ id: z.uuid(), organization_id: z.uuid() }),
  product: z.object({ id: z.uuid(), organization_id: z.uuid() }),
  status: z.enum([
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ]),
  amount: money,
  currency: z.string(),
  recurring_interval: z.enum(["year", "month"]),
  recurring_interval_count: z.literal(1),
  trial_start: z.null(),
  trial_end: z.null(),
  discount_id: z.null(),
  current_period_start: date,
  current_period_end: date,
  cancel_at_period_end: z.boolean(),
  canceled_at: date.nullable(),
  past_due_at: date.nullable().optional(),
  pending_update: z.unknown().nullable(),
  prices: z.array(price).length(1),
});
const orderSchema = z.object({
  id: z.uuid(),
  customer_id: z.uuid(),
  product_id: z.uuid(),
  subscription_id: z.uuid(),
  checkout_id: z.uuid().nullable(),
  status: z.enum([
    "draft",
    "pending",
    "paid",
    "refunded",
    "partially_refunded",
    "void",
  ]),
  paid: z.boolean(),
  billing_reason: z.string(),
  net_amount: money,
  tax_amount: money,
  total_amount: money,
  discount_amount: z.literal(0),
  currency: z.string(),
  refunded_amount: money,
  refunded_tax_amount: money,
});
export function normalizeSubscription(
  raw: unknown,
  rawOrders: unknown[],
  expected: SubscriptionTerms,
) {
  const parsed = subscriptionSchema.safeParse(raw);
  if (!parsed.success) throw new BillingReviewError("subscription_shape");
  const s = parsed.data,
    p = s.prices[0];
  if (
    s.customer_id !== expected.customerID ||
    s.customer.id !== expected.customerID ||
    s.customer.organization_id !== expected.organizationID ||
    s.product.organization_id !== expected.organizationID ||
    s.product.id !== expected.productID ||
    s.product_id !== expected.productID ||
    s.checkout_id !== expected.checkoutID ||
    p.id !== expected.priceID ||
    p.product_id !== expected.productID ||
    p.price_amount !== expected.amount ||
    p.price_currency.toUpperCase() !== expected.currency ||
    p.tax_behavior !== expected.taxBehavior ||
    s.currency.toUpperCase() !== expected.currency ||
    s.recurring_interval !== expected.interval
  )
    throw new BillingReviewError("subscription_mismatch");
  const orders = rawOrders.map((value) => {
    const parsed = orderSchema.safeParse(value);
    if (!parsed.success) throw new BillingReviewError("order_shape");
    const order = parsed.data;
    const approved = [expected, ...(expected.historicalProducts || [])].find(
      (product) => product.productID === order.product_id,
    );
    const initial = expected.initialProduct || expected;
    if (
      order.customer_id !== expected.customerID ||
      !approved ||
      order.subscription_id !== s.id ||
      order.currency.toUpperCase() !== approved?.currency ||
      order.net_amount + order.tax_amount !== order.total_amount ||
      order.refunded_amount + order.refunded_tax_amount > order.total_amount ||
      order.total_amount < 0 ||
      (order.billing_reason === "subscription_create" &&
        (order.product_id !== initial.productID ||
          order.checkout_id !== expected.checkoutID ||
          (initial.taxBehavior === "inclusive"
            ? order.total_amount
            : order.net_amount) !== initial.amount))
    )
      throw new BillingReviewError("order_mismatch");
    return order;
  });
  const initialPaid =
    expected.previouslyActivated ||
    orders.some(
      (order) =>
        order.billing_reason === "subscription_create" &&
        order.paid &&
        ["paid", "partially_refunded"].includes(order.status) &&
        order.refunded_amount + order.refunded_tax_amount < order.total_amount,
    );
  return { ...s, orders, initialPaid };
}
