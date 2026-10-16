import { test, expect } from "bun:test";
import { databaseBilling } from "../src/modules/hosting/database-billing";
import type { Connection } from "../src/modules/hosting/authorization";
function fixture(snapshot: Record<string, unknown>): Connection {
  return {
    query: async (sql: string) => ({
      rows: sql.includes("to_regclass")
        ? [{ relation: "present" }]
        : sql.includes("sum(")
          ? [{ cents: String(snapshot.monthlyPriceCents) }]
          : [
              {
                id: "1",
                snapshot,
                accepted_at: new Date(),
                billing_started_at: new Date(),
              },
            ],
    }),
  } as unknown as Connection;
}
test("database billing accepts only customer-bound sponsorships at zero cost", async () => {
  const terms = {
    monthlyPriceCents: 0,
    currency: "EUR",
    sponsoredCustomerID: "123",
  };
  expect(
    (await databaseBilling(fixture(terms), "123")).activeMonthlyNetCents,
  ).toBe(0);
  for (const patch of [
    { sponsoredCustomerID: undefined },
    { sponsoredCustomerID: "456" },
    { monthlyPriceCents: 1 },
    { monthlyPriceCents: -1 },
  ]) {
    await expect(
      databaseBilling(fixture({ ...terms, ...patch }), "123"),
    ).rejects.toHaveProperty("status", 503);
  }
  expect(
    (
      await databaseBilling(
        fixture({ monthlyPriceCents: 1490, currency: "EUR" }),
        "123",
      )
    ).activeMonthlyNetCents,
  ).toBe(1490);
});
