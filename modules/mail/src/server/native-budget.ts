import { MailServiceError } from "./instances";
import { type Connection } from "./native-ports";

export const mailBudgetSchemaSQL = `
CREATE TABLE IF NOT EXISTS webdock_mail.month_usage (
 customer_id text NOT NULL REFERENCES webdock_auth.tenant_customer(customer_id),
 period_start date NOT NULL,
 reserved bigint NOT NULL DEFAULT 0 CHECK(reserved>=0),
 accepted bigint NOT NULL DEFAULT 0 CHECK(accepted>=0),
 PRIMARY KEY(customer_id,period_start)
);
ALTER TABLE webdock_mail.month_usage DROP CONSTRAINT IF EXISTS month_usage_customer_id_fkey;
ALTER TABLE webdock_mail.month_usage ADD CONSTRAINT month_usage_customer_id_fkey
 FOREIGN KEY(customer_id) REFERENCES webdock_auth.tenant_customer(customer_id);
CREATE TABLE IF NOT EXISTS webdock_mail.budget_reservation (
 reference_id text PRIMARY KEY,
 customer_id text NOT NULL,
 period_start date NOT NULL,
 units integer NOT NULL CHECK(units BETWEEN 1 AND 100),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','accepted','released')),
 created_at timestamptz NOT NULL DEFAULT now(),settled_at timestamptz,
 FOREIGN KEY(customer_id,period_start) REFERENCES webdock_mail.month_usage(customer_id,period_start)
);
ALTER TABLE webdock_mail.budget_reservation ADD COLUMN IF NOT EXISTS send_path jsonb;
CREATE INDEX IF NOT EXISTS mail_budget_customer ON webdock_mail.budget_reservation(customer_id,period_start);
`;

export function mailBudgetGrants(role: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(role))
    throw Error("Invalid Mail database role");
  return `GRANT SELECT,INSERT,UPDATE ON webdock_mail.month_usage,webdock_mail.budget_reservation TO "${role}";`;
}

type SendPath =
  { kind: "direct" } | { kind: "stalwart"; serviceRevision: string };

function fail(message = "Mail budget reservation is unavailable."): never {
  throw new MailServiceError(message);
}

function identifiers(customerID: string, reference: string) {
  if (
    ![customerID, reference].every((value) => /^[1-9][0-9]{0,18}$/.test(value))
  )
    fail();
}

/** Internal admission primitive. Caller must authorize the sender/route in the SAME transaction. */
export async function reserveMailBudget(
  db: Connection,
  customerID: string,
  reference: string,
  units: number,
) {
  identifiers(customerID, reference);
  if (!Number.isSafeInteger(units) || units < 1 || units > 100) fail();
  const customer = (
    await db.query(
      `SELECT c.id FROM webdock_admin.customers c
    WHERE c.id=$1 AND c.status='active'
    AND EXISTS(SELECT 1 FROM webdock_auth.platform_settings WHERE id=true AND settings->>'mailEnabled'='true') FOR SHARE OF c`,
      [customerID],
    )
  ).rows[0];
  if (!customer) fail();
  // The customer lock also fences first-time incoming activation, which takes FOR UPDATE.
  const incoming = (
    await db.query(
      "SELECT desired_enabled,state,revision,applied_revision FROM webdock_mail.service WHERE customer_id=$1 FOR SHARE",
      [customerID],
    )
  ).rows[0];
  if (
    incoming &&
    (!incoming.desired_enabled ||
      incoming.state !== "ready" ||
      String(incoming.revision) !== String(incoming.applied_revision))
  )
    fail(
      "Incoming Mail is unavailable. Sending cannot bypass its configured route.",
    );
  const path: SendPath = incoming
    ? { kind: "stalwart", serviceRevision: String(incoming.revision) }
    : { kind: "direct" };
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    "mail-budget:" + customerID,
  ]);
  const existing = (
    await db.query(
      "SELECT customer_id,units,state,send_path,period_start::text AS period FROM webdock_mail.budget_reservation WHERE reference_id=$1",
      [reference],
    )
  ).rows[0];
  if (existing) {
    if (
      existing.customer_id !== customerID ||
      existing.units !== units ||
      existing.send_path?.kind !== path.kind ||
      (path.kind === "stalwart" &&
        existing.send_path.serviceRevision !== path.serviceRevision)
    )
      fail();
    if (existing.state !== "reserved")
      return { created: false, state: existing.state as string, path };
  }
  const subscription = (
    await db.query(
      "SELECT base,extras FROM webdock_auth.tenant_subscription WHERE customer_id=$1 FOR SHARE",
      [customerID],
    )
  ).rows[0];
  const allowance = subscription?.base?.mailMessages;
  const base = allowance === undefined ? 0 : allowance,
    extra = subscription?.extras?.mailMessages ?? 0;
  if (
    (base !== null && (!Number.isSafeInteger(base) || base < 0)) ||
    !Number.isSafeInteger(extra) ||
    extra < 0
  )
    fail();
  if (base !== null && !Number.isSafeInteger(base + extra)) fail();
  const limit = base === null ? null : BigInt(base) + BigInt(extra);
  const period = (
    await db.query(
      "SELECT date_trunc('month',now() AT TIME ZONE 'UTC')::date::text AS period",
    )
  ).rows[0].period;
  await db.query(
    "INSERT INTO webdock_mail.month_usage(customer_id,period_start) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [customerID, period],
  );
  const usage = (
    await db.query(
      "SELECT reserved,accepted FROM webdock_mail.month_usage WHERE customer_id=$1 AND period_start=$2 FOR UPDATE",
      [customerID, period],
    )
  ).rows[0];
  const additional = existing?.period === period ? 0 : units;
  const gateway = (
    await db.query(
      "SELECT to_regclass('webdock_auth.mail_usage_period') AS present",
    )
  ).rows[0].present
    ? BigInt(
        (
          await db.query(
            "SELECT coalesce(sum(reserved+consumed),0)::text AS used FROM webdock_auth.mail_usage_period WHERE customer_id=$1 AND period=$2",
            [customerID, period],
          )
        ).rows[0].used,
      )
    : 0n;
  if (
    limit !== null &&
    BigInt(usage.reserved) +
      BigInt(usage.accepted) +
      gateway +
      BigInt(additional) >
      limit
  )
    fail("Monthly Mail allowance exhausted.");
  if (existing) {
    // Scheduled/backlogged mail is charged to the month of dispatch, without double reserving.
    if (existing.period !== period) {
      await db.query(
        "UPDATE webdock_mail.month_usage SET reserved=reserved-$3 WHERE customer_id=$1 AND period_start=$2",
        [customerID, existing.period, units],
      );
      await db.query(
        "UPDATE webdock_mail.month_usage SET reserved=reserved+$3 WHERE customer_id=$1 AND period_start=$2",
        [customerID, period, units],
      );
      await db.query(
        "UPDATE webdock_mail.budget_reservation SET period_start=$2 WHERE reference_id=$1",
        [reference, period],
      );
    }
    return { created: false, state: existing.state as string, path };
  }
  await db.query(
    "INSERT INTO webdock_mail.budget_reservation(reference_id,customer_id,period_start,units,send_path) VALUES($1,$2,$3,$4,$5)",
    [reference, customerID, period, units, JSON.stringify(path)],
  );
  await db.query(
    "UPDATE webdock_mail.month_usage SET reserved=reserved+$3 WHERE customer_id=$1 AND period_start=$2",
    [customerID, period, units],
  );
  return { created: true, state: "reserved", path };
}

/** Release only after a definite non-acceptance; unknown outcomes retain their reservation. */
export async function settleMailBudget(
  db: Connection,
  customerID: string,
  reference: string,
  state: "accepted" | "released",
) {
  identifiers(customerID, reference);
  if (!["accepted", "released"].includes(state)) fail();
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    "mail-budget:" + customerID,
  ]);
  const reservation = (
    await db.query(
      "SELECT units,period_start,state FROM webdock_mail.budget_reservation WHERE customer_id=$1 AND reference_id=$2 FOR UPDATE",
      [customerID, reference],
    )
  ).rows[0];
  if (!reservation) fail();
  if (reservation.state === state) return { settled: true };
  if (reservation.state !== "reserved") fail();
  await db.query(
    "UPDATE webdock_mail.month_usage SET reserved=reserved-$3,accepted=accepted+$4 WHERE customer_id=$1 AND period_start=$2",
    [
      customerID,
      reservation.period_start,
      reservation.units,
      state === "accepted" ? reservation.units : 0,
    ],
  );
  await db.query(
    "UPDATE webdock_mail.budget_reservation SET state=$3,settled_at=now() WHERE customer_id=$1 AND reference_id=$2",
    [customerID, reference, state],
  );
  return { settled: true };
}
