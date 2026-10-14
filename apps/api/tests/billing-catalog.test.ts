import { test, expect } from "bun:test";
import { verifyPublishedProduct } from "../src/modules/billing/catalog-policy";
const expected = {
  organizationID: "11111111-1111-4111-8111-111111111111",
  versionID: "123",
  operationID: "22222222-2222-4222-8222-222222222222",
  sku: "fixture",
  hash: "a".repeat(64),
  name: "Website",
  description: "Fixture",
  amount: 5880,
  currency: "EUR",
  taxBehavior: "inclusive",
  interval: "year",
  visibility: "private",
};
const product = {
  id: "33333333-3333-4333-8333-333333333333",
  organization_id: expected.organizationID,
  name: expected.name,
  description: expected.description,
  is_archived: false,
  is_recurring: true,
  recurring_interval: "year",
  recurring_interval_count: 1,
  trial_interval: null,
  trial_interval_count: null,
  visibility: "private",
  metadata: {
    webdock_sku: expected.sku,
    webdock_version_id: expected.versionID,
    webdock_operation_id: expected.operationID,
    webdock_hash: expected.hash,
  },
  prices: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      product_id: "33333333-3333-4333-8333-333333333333",
      source: "catalog",
      amount_type: "fixed",
      price_amount: 5880,
      price_currency: "eur",
      tax_behavior: "inclusive",
      is_archived: false,
    },
  ],
};
test("publication readback binds organization, immutable terms, exact fixed price and no trial", () => {
  expect(verifyPublishedProduct(product, expected)).toEqual({
    productID: product.id,
    priceIDs: [product.prices[0].id],
  });
  for (const patch of [
    { organization_id: "other" },
    { recurring_interval: "month" },
    { trial_interval: "day" },
    { visibility: "public" },
    { metadata: {} },
    { prices: [{ ...product.prices[0], price_amount: 1 }] },
    { prices: [...product.prices, ...product.prices] },
  ])
    expect(() =>
      verifyPublishedProduct({ ...product, ...patch }, expected),
    ).toThrow();
});
