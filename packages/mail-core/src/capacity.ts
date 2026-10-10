import type { PoolClient } from "pg";
export const mailInstanceDemand = { apps: 1, cpuMillicores: 500, memoryBytes: 1073741824, volumeBytes: 10737418240, ephemeralBytes: 268435456, replicasPerApp: 1, concurrentDeployments: 1 } as const;
export type MailDemand = { -readonly [K in keyof typeof mailInstanceDemand]: number };
type Connection = Pick<PoolClient, "query">;
export class MailCapacityError extends Error {}

function total(rows: { demand: Record<string, number>; status: string }[]): MailDemand {
  const result = Object.fromEntries(Object.keys(mailInstanceDemand).map(key => [key, 0])) as MailDemand;
  for (const row of rows) for (const key of Object.keys(result) as (keyof MailDemand)[]) {
    const value = key === "concurrentDeployments" && row.status === "active" ? 0 : row.demand[key] ?? 0;
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid cluster reservation");
    result[key] = key === "replicasPerApp" ? Math.max(result[key], value) : result[key] + value;
    if (!Number.isSafeInteger(result[key])) throw new Error("Cluster reservation exceeds the supported range");
  }
  return result;
}

/** Hosting must count native Mail reservations even while the Mail feature switch is off. */
export async function nativeClusterDemand(db: Connection, clusterID: string): Promise<MailDemand> {
  if (!(await db.query("SELECT to_regclass('webdock_mail.cluster_reservation') AS relation")).rows[0].relation) return total([]);
  return total((await db.query("SELECT demand,status FROM webdock_mail.cluster_reservation WHERE cluster_id=$1", [clusterID])).rows);
}

export async function reserveMailCapacity(db: Connection, customerID: string, clusterID: string) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`hosting-cluster:${clusterID}`]);
  const cluster = (await db.query(`SELECT c.*,a.revoked,a.last_seen,a.observation FROM webdock_auth.hosting_cluster c
    JOIN webdock_auth.hosting_agent a ON a.cluster_id=c.id WHERE c.id=$1 FOR SHARE OF c,a`, [clusterID])).rows[0];
  if (!cluster || cluster.ownership !== "platform" || cluster.provider !== "k3s" || !cluster.verified || cluster.revoked ||
    !cluster.last_seen || Date.now() - new Date(cluster.last_seen).getTime() >= 90_000 || cluster.observation?.capabilities?.nativeMail?.version !== 1 ||
    cluster.observation?.capabilities?.storageVersion !== 1)
    throw new MailCapacityError("A fresh managed cluster with verified Mail and storage support is required.");
  const hosting = (await db.query("SELECT demand,status FROM webdock_auth.hosting_reservation WHERE cluster_id=$1 AND status<>'released'", [clusterID])).rows;
  const mail = (await db.query("SELECT demand,status FROM webdock_mail.cluster_reservation WHERE cluster_id=$1 AND customer_id<>$2", [clusterID, customerID])).rows;
  const used = total([...hosting, ...mail]);
  for (const key of Object.keys(mailInstanceDemand) as (keyof MailDemand)[]) {
    const limit = cluster.capacity?.[key];
    const wanted = key === "replicasPerApp" ? Math.max(used[key], mailInstanceDemand[key]) : used[key] + mailInstanceDemand[key];
    if (!Number.isSafeInteger(limit) || limit < wanted) throw new MailCapacityError("Verified cluster capacity is insufficient for this Mail instance.");
  }
  await db.query(`INSERT INTO webdock_mail.cluster_reservation(customer_id,cluster_id,demand,status) VALUES($1,$2,$3,'reserved')
    ON CONFLICT(customer_id) DO UPDATE SET demand=excluded.demand,status='reserved' WHERE cluster_reservation.cluster_id=excluded.cluster_id`,
  [customerID, clusterID, JSON.stringify(mailInstanceDemand)]);
}

export async function completeMailCapacity(db: Connection, customerID: string, enabled: boolean) {
  const demand = enabled ? mailInstanceDemand : { ...mailInstanceDemand, apps: 0, cpuMillicores: 0, memoryBytes: 0, ephemeralBytes: 0, replicasPerApp: 0, concurrentDeployments: 0 };
  await db.query("UPDATE webdock_mail.cluster_reservation SET demand=$2,status='active' WHERE customer_id=$1", [customerID, JSON.stringify(demand)]);
}
