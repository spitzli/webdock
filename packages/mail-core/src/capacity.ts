import type { PoolClient } from "pg";
export const mailInstanceDemand = {
  apps: 1,
  cpuMillicores: 500,
  memoryBytes: 1073741824,
  volumeBytes: 10737418240,
  ephemeralBytes: 268435456,
  replicasPerApp: 1,
  concurrentDeployments: 1,
} as const;
export type MailDemand = {
  -readonly [K in keyof typeof mailInstanceDemand]: number;
};
type Connection = Pick<PoolClient, "query">;
export { capacityRlsSQL } from "./capacity-rls";
export class MailCapacityError extends Error {}

function total(
  rows: { demand: Record<string, number>; status: string }[],
): MailDemand {
  const result = Object.fromEntries(
    Object.keys(mailInstanceDemand).map((key) => [key, 0]),
  ) as MailDemand;
  for (const row of rows)
    for (const key of Object.keys(result) as (keyof MailDemand)[]) {
      const value =
        key === "concurrentDeployments" && row.status === "active"
          ? 0
          : (row.demand[key] ?? 0);
      if (!Number.isSafeInteger(value) || value < 0)
        throw new Error("Invalid cluster reservation");
      result[key] =
        key === "replicasPerApp"
          ? Math.max(result[key], value)
          : result[key] + value;
      if (!Number.isSafeInteger(result[key]))
        throw new Error("Cluster reservation exceeds the supported range");
    }
  return result;
}

/** Cross-tenant sums stay inside a reviewed SECURITY DEFINER helper. */
export async function clusterCapacityDemand(
  db: Connection,
  clusterID: string,
  kind: "apps" | "native" | "all",
  excludedCustomer?: string,
): Promise<MailDemand> {
  const result = (
    await db.query("SELECT webdock_rls.capacity_demand($1,$2,$3) AS demand", [
      clusterID,
      kind,
      excludedCustomer ?? null,
    ])
  ).rows[0]?.demand;
  if (
    !result ||
    Object.keys(result).length !== Object.keys(mailInstanceDemand).length ||
    Object.keys(mailInstanceDemand).some(
      (key) => !Number.isSafeInteger(result[key]) || result[key] < 0,
    )
  )
    throw new Error("Invalid cluster capacity result");
  return total([{ demand: result, status: "reserved" }]);
}
export type PoolCapacity = {
  node: string;
  pool_id: string;
  capacity_bytes: string;
  held_cpu: number;
  held_memory: number;
  held_volume: number;
  known_cpu: number;
  known_memory: number;
  allocated: number;
};
export async function databasePoolCapacity(
  db: Connection,
  clusterID: string,
): Promise<PoolCapacity[]> {
  const rows = (
    await db.query("SELECT * FROM webdock_rls.capacity_pools($1)", [clusterID])
  ).rows;
  return rows.map((row) => {
    for (const key of [
      "held_cpu",
      "held_memory",
      "held_volume",
      "known_cpu",
      "known_memory",
      "allocated",
    ]) {
      row[key] = Number(row[key]);
      if (!Number.isSafeInteger(row[key]) || row[key] < 0)
        throw new Error("Invalid database pool capacity");
    }
    return row;
  });
}
/** A physical PostgreSQL installation counts once, including while paused or retained. */
async function databaseReservations(db: Connection, clusterID: string) {
  if (
    !(
      await db.query(
        "SELECT to_regclass('webdock_auth.hosting_database_backend') AS relation",
      )
    ).rows[0].relation
  )
    return [];
  const rows = (
    await db.query(
      "SELECT pool_id,demand,CASE WHEN state IN ('provisioning','updating') THEN 'reserved' ELSE 'active' END AS status FROM webdock_auth.hosting_database_backend WHERE cluster_id=$1 AND state<>'purged'",
      [clusterID],
    )
  ).rows;
  const pools = (
    await db.query(
      "SELECT pool_id,capacity_bytes FROM webdock_auth.hosting_database_pool WHERE cluster_id=$1",
      [clusterID],
    )
  ).rows;
  const configured = new Set(pools.map((p) => p.pool_id));
  let volume =
    pools.reduce((sum, p) => sum + Number(p.capacity_bytes), 0) +
    rows
      .filter((r) => !configured.has(r.pool_id))
      .reduce((sum, r) => sum + (r.demand.volumeBytes ?? 0), 0);
  const cluster = (
    await db.query(
      "SELECT c.capacity,a.observation FROM webdock_auth.hosting_cluster c LEFT JOIN webdock_auth.hosting_agent a ON a.cluster_id=c.id WHERE c.id=$1",
      [clusterID],
    )
  ).rows[0];
  const appCapacity = cluster?.observation?.capacity?.volumeBytes,
    approved = cluster?.capacity?.volumeBytes;
  // A private DB pool cannot be sold again as App storage. Also retain any gap
  // between the approved ceiling and currently verified App-pool capacity.
  if (
    (pools.length ||
      rows.length ||
      cluster?.observation?.capabilities?.databaseVersion === 1) &&
    Number.isSafeInteger(appCapacity) &&
    Number.isSafeInteger(approved)
  )
    volume = Math.max(volume, approved - appCapacity);
  return [
    ...rows.map((r) => ({
      status: r.status,
      demand: { ...r.demand, volumeBytes: 0 },
    })),
    { status: "active", demand: { ...total([]), volumeBytes: volume } },
  ];
}
/** App and Mail admission must count native reservations even when product switches are off. */
export async function nativeClusterDemand(
  db: Connection,
  clusterID: string,
): Promise<MailDemand> {
  if (process.env.DATABASE_RLS_SECRET)
    return clusterCapacityDemand(db, clusterID, "native");
  const databases = await databaseReservations(db, clusterID);
  const hasMail = (
    await db.query(
      "SELECT to_regclass('webdock_mail.cluster_reservation') AS relation",
    )
  ).rows[0].relation;
  const mail = hasMail
    ? (
        await db.query(
          "SELECT demand,status FROM webdock_mail.cluster_reservation WHERE cluster_id=$1",
          [clusterID],
        )
      ).rows
    : [];
  return total([...mail, ...databases]);
}

export async function reserveMailCapacity(
  db: Connection,
  customerID: string,
  clusterID: string,
) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `hosting-cluster:${clusterID}`,
  ]);
  const cluster = process.env.DATABASE_RLS_SECRET
    ? (
        await db.query("SELECT webdock_rls.cluster_snapshot($1) AS cluster", [
          clusterID,
        ])
      ).rows[0]?.cluster
    : (
        await db.query(
          `SELECT c.*,a.revoked,a.last_seen,a.observation FROM webdock_auth.hosting_cluster c
    JOIN webdock_auth.hosting_agent a ON a.cluster_id=c.id WHERE c.id=$1 FOR SHARE OF c,a`,
          [clusterID],
        )
      ).rows[0];
  if (
    !cluster ||
    cluster.ownership !== "platform" ||
    !/^v[0-9][^,]*\+k3s[0-9]+$/.test(cluster.observation?.version || "") ||
    !cluster.verified ||
    cluster.revoked ||
    !cluster.last_seen ||
    Date.now() - new Date(cluster.last_seen).getTime() >= 90_000 ||
    cluster.observation?.capabilities?.nativeMail?.version !== 1 ||
    cluster.observation?.capabilities?.storageVersion !== 1
  )
    throw new MailCapacityError(
      "A fresh managed cluster with verified Mail and storage support is required.",
    );
  const hosting = process.env.DATABASE_RLS_SECRET
    ? []
    : (
        await db.query(
          "SELECT demand,status FROM webdock_auth.hosting_reservation WHERE cluster_id=$1 AND status<>'released'",
          [clusterID],
        )
      ).rows;
  const mail = process.env.DATABASE_RLS_SECRET
    ? []
    : (
        await db.query(
          "SELECT demand,status FROM webdock_mail.cluster_reservation WHERE cluster_id=$1 AND customer_id<>$2",
          [clusterID, customerID],
        )
      ).rows;
  const used = process.env.DATABASE_RLS_SECRET
    ? await clusterCapacityDemand(db, clusterID, "all", customerID)
    : total([
        ...hosting,
        ...mail,
        ...(await databaseReservations(db, clusterID)),
      ]);
  for (const key of Object.keys(mailInstanceDemand) as (keyof MailDemand)[]) {
    const limit = cluster.capacity?.[key];
    const wanted =
      key === "replicasPerApp"
        ? Math.max(used[key], mailInstanceDemand[key])
        : used[key] + mailInstanceDemand[key];
    if (!Number.isSafeInteger(limit) || limit < wanted)
      throw new MailCapacityError(
        "Verified cluster capacity is insufficient for this Mail instance.",
      );
  }
  await db.query(
    `INSERT INTO webdock_mail.cluster_reservation(customer_id,cluster_id,demand,status) VALUES($1,$2,$3,'reserved')
    ON CONFLICT(customer_id) DO UPDATE SET demand=excluded.demand,status='reserved' WHERE cluster_reservation.cluster_id=excluded.cluster_id`,
    [customerID, clusterID, JSON.stringify(mailInstanceDemand)],
  );
}

export async function completeMailCapacity(
  db: Connection,
  customerID: string,
  enabled: boolean,
) {
  const demand = enabled
    ? mailInstanceDemand
    : {
        ...mailInstanceDemand,
        apps: 0,
        cpuMillicores: 0,
        memoryBytes: 0,
        ephemeralBytes: 0,
        replicasPerApp: 0,
        concurrentDeployments: 0,
      };
  await db.query(
    "UPDATE webdock_mail.cluster_reservation SET demand=$2,status='active' WHERE customer_id=$1",
    [customerID, JSON.stringify(demand)],
  );
}
