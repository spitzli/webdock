import { HostingError } from "@webdock/hosting-contracts";
import type { Connection } from "./authorization";
export async function databaseBilling(db: Connection, customerID: string) {
  if (
    !(
      await db.query(
        "SELECT to_regclass('webdock_auth.hosting_database_order') AS relation",
      )
    ).rows[0].relation
  )
    return { activeMonthlyNetCents: 0, currency: "EUR", orders: [] };
  const rows = (
    await db.query(
      `SELECT o.id,o.project_id,o.database_id,o.snapshot,o.accepted_at,o.billing_started_at,o.ended_at,o.cancellation_requested_at,d.name
 FROM webdock_auth.hosting_database_order o LEFT JOIN webdock_auth.hosting_database d ON d.id=o.database_id
 WHERE o.customer_id=$1 ORDER BY o.accepted_at DESC,o.id DESC LIMIT 100`,
      [customerID],
    )
  ).rows;
  const orders = rows.map((r) => {
    const price = r.snapshot.monthlyPriceCents;
    if (
      !Number.isSafeInteger(price) ||
      price < 0 ||
      (price === 0
        ? r.snapshot.sponsoredCustomerID !== customerID
        : r.snapshot.sponsoredCustomerID !== undefined) ||
      r.snapshot.currency !== "EUR"
    )
      throw new HostingError(
        503,
        "Database billing terms require operator review.",
      );
    return {
      id: r.id,
      projectID: r.project_id,
      databaseID: r.database_id,
      name: r.name,
      kind: r.snapshot.kind,
      monthlyPriceCents: price,
      currency: "EUR" as const,
      acceptedAt: r.accepted_at.toISOString(),
      billingStartedAt: r.billing_started_at?.toISOString() ?? null,
      endedAt: r.ended_at?.toISOString() ?? null,
      cancellationRequestedAt:
        r.cancellation_requested_at?.toISOString() ?? null,
    };
  });
  // Total is not limited to the first history page.
  const total = (
    await db.query(
      "SELECT COALESCE(sum((snapshot->>'monthlyPriceCents')::bigint),0)::text AS cents FROM webdock_auth.hosting_database_order WHERE customer_id=$1 AND billing_started_at IS NOT NULL AND ended_at IS NULL",
      [customerID],
    )
  ).rows[0].cents;
  const activeMonthlyNetCents = Number(total);
  if (!Number.isSafeInteger(activeMonthlyNetCents) || activeMonthlyNetCents < 0)
    throw new HostingError(503, "Database billing total is unavailable.");
  return { activeMonthlyNetCents, currency: "EUR" as const, orders };
}
