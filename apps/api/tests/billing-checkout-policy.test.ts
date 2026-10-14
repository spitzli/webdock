import { test, expect } from "bun:test";
import { verifyCheckout } from "../src/modules/billing/checkout-policy";
const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];
const expected = {
  environment: "sandbox" as const,
  organizationID: ids[0],
  customerID: "123",
  contractID: "456",
  operationID: ids[1],
  productID: ids[2],
  priceID: ids[1],
  amount: 5880,
  currency: "EUR",
  taxBehavior: "inclusive",
  interval: "year",
  successURL: "https://studio.webdock.dev/tenants/123/billing?attempt=789",
  returnURL: "https://studio.webdock.dev/tenants/123/billing",
};
const raw = {
  id: ids[1],
  organization_id: ids[0],
  external_customer_id: "webdock:123",
  customer_id: null,
  status: "open",
  url: "https://sandbox.polar.sh/checkout/fixture",
  expires_at: new Date(Date.now() + 3600000).toISOString(),
  success_url: expected.successURL,
  return_url: expected.returnURL,
  product_id: ids[2],
  product_price_id: ids[1],
  products: [{ id: ids[2] }],
  product: {
    id: ids[2],
    recurring_interval: "year",
    recurring_interval_count: 1,
  },
  product_price: {
    id: ids[1],
    product_id: ids[2],
    amount_type: "fixed",
    price_amount: 5880,
    price_currency: "eur",
    tax_behavior: "inclusive",
  },
  allow_trial: false,
  active_trial_interval: null,
  active_trial_interval_count: null,
  trial_end: null,
  allow_discount_codes: false,
  discount_id: null,
  discount_amount: 0,
  metadata: { webdock_contract_id: "456", webdock_operation_id: ids[1] },
  currency: "eur",
};
test("checkout readback binds the accepted contract and server price without trusting return parameters", () => {
  expect(verifyCheckout(raw, expected).id).toBe(ids[1]);
  for (const patch of [
    { external_customer_id: "webdock:999" },
    { allow_trial: true },
    { allow_discount_codes: true },
    { discount_amount: 1 },
    { url: "https://attacker.invalid/checkout/x" },
    { url: "https://polar.sh/checkout/x" },
    { success_url: "https://attacker.invalid" },
    { products: [...raw.products, ...raw.products] },
    { product_price: { ...raw.product_price, price_amount: 1 } },
  ])
    expect(() => verifyCheckout({ ...raw, ...patch }, expected)).toThrow();
});
