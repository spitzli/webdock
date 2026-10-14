import { test, expect } from "bun:test";
import { productVersionInput } from "../src/modules/billing/catalog-input";
const base = {
  sku: "fixture-product",
  name: "Fixture",
  visibility: "internal",
  operationallyReady: false,
  currency: "EUR",
  taxBehavior: "exclusive",
  description: "Fixture",
  terms: "Requires a written offer.",
};
test("manual catalog drafts support fixed recurring, one-time and unpriced offers", () => {
  for (const interval of ["month", "year", "once"])
    for (const amount of [590, null])
      expect(
        productVersionInput.safeParse({
          ...base,
          family: "database",
          interval,
          amount,
          entitlements: { kind: "manual" },
        }).success,
      ).toBe(true);
});
test("website purchases retain their original priced recurring entitlement boundary", () => {
  const website = {
    ...base,
    family: "website",
    interval: "year",
    amount: 5880,
    entitlements: {
      websites: 1,
      editors: 1,
      mediaBytes: "500000000",
      mailMonthly: 100,
    },
  };
  expect(productVersionInput.safeParse(website).success).toBe(true);
  for (const patch of [
    { amount: null },
    { interval: "once" },
    { entitlements: { kind: "manual" } },
    { family: "database" },
  ])
    expect(
      productVersionInput.safeParse({ ...website, ...patch }).success,
    ).toBe(false);
  expect(
    productVersionInput.safeParse({
      ...base,
      family: "service",
      interval: "once",
      amount: 0,
      entitlements: { kind: "manual" },
    }).success,
  ).toBe(false);
});
import { initialCatalog } from "../src/modules/billing/initial-catalog";
test("the complete source catalog preserves prices and leaves ranges unpriced and disabled", () => {
  expect(initialCatalog).toHaveLength(31);
  expect(new Set(initialCatalog.map((p) => p.sku)).size).toBe(
    initialCatalog.length,
  );
  for (const product of initialCatalog) {
    expect(productVersionInput.safeParse(product).success).toBe(true);
    expect(product.operationallyReady).toBe(false);
    expect(product.taxBehavior).toBe(
      product.family === "website" ? "inclusive" : "exclusive",
    );
  }
  expect(initialCatalog.some((p) => p.sku === "catalog-module-month-v1")).toBe(
    false,
  );
  expect(
    initialCatalog.filter((p) =>
      [
        "development-hour-once-v1",
        "changes-small-month-v1",
        "care-month-v1",
      ].includes(p.sku),
    ),
  ).toHaveLength(0);
  expect(initialCatalog.filter((p) => p.amount === null)).toHaveLength(13);
  expect(
    initialCatalog.filter((p) => p.family === "database").map((p) => p.amount),
  ).toEqual([590, 1490, 2490]);
});
