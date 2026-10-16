import { test, expect } from "bun:test";
import { normalizeSubscription } from "../src/modules/billing/reconcile-policy";
const id = (n: number) =>
  `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const expected = {
  organizationID: id(1),
  customerID: id(2),
  productID: id(3),
  checkoutID: id(4),
  priceID: id(5),
  amount: 5880,
  currency: "EUR",
  interval: "year",
  taxBehavior: "inclusive",
  previouslyActivated: false,
};
const subscription = {
  id: id(6),
  customer_id: id(2),
  product_id: id(3),
  checkout_id: id(4),
  customer: { id: id(2), organization_id: id(1) },
  product: { id: id(3), organization_id: id(1) },
  status: "active",
  amount: 5880,
  currency: "eur",
  recurring_interval: "year",
  recurring_interval_count: 1,
  trial_start: null,
  trial_end: null,
  discount_id: null,
  current_period_start: "2026-10-14T00:00:00Z",
  current_period_end: "2027-10-14T00:00:00Z",
  cancel_at_period_end: false,
  canceled_at: null,
  pending_update: null,
  prices: [
    {
      id: id(5),
      product_id: id(3),
      amount_type: "fixed",
      price_amount: 5880,
      price_currency: "eur",
      tax_behavior: "inclusive",
    },
  ],
};
const order = {
  id: id(7),
  customer_id: id(2),
  product_id: id(3),
  subscription_id: id(6),
  checkout_id: id(4),
  status: "paid",
  paid: true,
  billing_reason: "subscription_create",
  net_amount: 4941,
  tax_amount: 939,
  total_amount: 5880,
  discount_amount: 0,
  currency: "eur",
  refunded_amount: 0,
  refunded_tax_amount: 0,
};
test("active state alone does not grant service; matching paid initial order is required", () => {
  expect(normalizeSubscription(subscription, [], expected).initialPaid).toBe(
    false,
  );
  expect(
    normalizeSubscription(subscription, [order], expected).initialPaid,
  ).toBe(true);
  expect(
    normalizeSubscription(
      { ...subscription, cancel_at_period_end: true },
      [order],
      expected,
    ).status,
  ).toBe("active");
  expect(
    normalizeSubscription(
      { ...subscription, status: "past_due" },
      [order],
      expected,
    ).status,
  ).toBe("past_due");
});
test("foreign IDs, changed prices, trials and mismatched paid orders require review", () => {
  for (const patch of [
    { customer_id: id(9) },
    { checkout_id: id(9) },
    { product_id: id(9) },
    { trial_start: "2026-10-14T00:00:00Z" },
    { prices: [{ ...subscription.prices[0], price_amount: 1 }] },
  ])
    expect(() =>
      normalizeSubscription({ ...subscription, ...patch }, [order], expected),
    ).toThrow();
  expect(() =>
    normalizeSubscription(
      subscription,
      [{ ...order, total_amount: 1 }],
      expected,
    ),
  ).toThrow();
});
test("partial refunds do not cancel service and a missing order cannot erase an already confirmed initial payment", () => {
  expect(
    normalizeSubscription(
      subscription,
      [{ ...order, status: "partially_refunded", refunded_amount: 100 }],
      expected,
    ).initialPaid,
  ).toBe(true);
  expect(
    normalizeSubscription(subscription, [], {
      ...expected,
      previouslyActivated: true,
    }).initialPaid,
  ).toBe(true);
});
