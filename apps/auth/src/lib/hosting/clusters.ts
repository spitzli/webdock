import {byokCluster,byokPolicy} from "./byok";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import {
  HostingError,
  observationSchema,
  resourceID,
  type HostingActor,
} from "@webdock/hosting-contracts";
import { authorizeHosting, type Connection } from "./authorization";
import { transaction, audit, clusterLock } from "./db";
export type Agent = {
  clusterID: string;
  generation: number;
  credentialHash: string;
};
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function verifyAgent(db: Connection, agent: Agent) {
  const row = (
    await db.query(
      "SELECT * FROM webdock_auth.hosting_agent WHERE cluster_id=$1 AND NOT revoked FOR SHARE",
      [agent.clusterID],
    )
  ).rows[0];
  if (
    !row ||
    row.generation !== agent.generation ||
    !timingSafeEqual(
      Buffer.from(row.credential_hash, "hex"),
      Buffer.from(agent.credentialHash, "hex"),
    )
  )
    throw new HostingError(401, "Cluster authentication failed.");
  return row;
}
export async function authenticateAgent(
  clusterID: string,
  credential: string,
): Promise<Agent> {
  resourceID.parse(clusterID);
  if (!/^[A-Za-z0-9_-]{43}$/.test(credential))
    throw new HostingError(401, "Cluster authentication failed.");
  return transaction(async (db) => {
    const row = (
      await db.query(
        "SELECT generation FROM webdock_auth.hosting_agent WHERE cluster_id=$1",
        [clusterID],
      )
    ).rows[0];
    const agent = {
      clusterID,
      generation: row?.generation ?? 0,
      credentialHash: digest(credential),
    };
    await verifyAgent(db, agent);
    return agent;
  });
}
export async function issueEnrollment(
  actor: HostingActor,
  enrollmentID: string,
) {
  return transaction(async (db) => {
    if (actor.source !== "studio")
      throw new HostingError(403, "Open cluster setup in Studio.");
    const row = (
      await db.query(
        "SELECT * FROM webdock_auth.hosting_enrollment WHERE id=$1 AND actor_id=$2 FOR UPDATE",
        [resourceID.parse(enrollmentID), actor.subject],
      )
    ).rows[0];
    if (
      !row ||
      row.issued_at ||
      row.consumed_at ||
      new Date(row.expires_at).getTime() <= Date.now()
    )
      throw new HostingError(
        409,
        "Enrollment expired or was already displayed. Create a new enrollment.",
      );
    const owned=(await db.query("SELECT ownership FROM webdock_auth.hosting_cluster WHERE id=$1",[row.cluster_id])).rows[0];
    if(owned?.ownership==='tenant')await byokCluster(db,actor,row.cluster_id,true);
    else await authorizeHosting(actor,{write:true,operator:true},db);
    const token = randomBytes(32).toString("base64url");
    await db.query(
      "UPDATE webdock_auth.hosting_enrollment SET token_hash=$2,issued_at=now() WHERE id=$1",
      [row.id, digest(token)],
    );
    await audit(db, actor, "enrollment.display", row.cluster_id);
    return {
      clusterID: row.cluster_id,
      token,
      expiresAt: row.expires_at.toISOString(),
    };
  });
}
export async function consumeEnrollment(clusterID: string, token: string) {
  resourceID.parse(clusterID);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new HostingError(401, "Enrollment is invalid.");
  return transaction(async (db) => {
    await clusterLock(db, clusterID);
    const row = (
      await db.query(
        "SELECT * FROM webdock_auth.hosting_enrollment WHERE cluster_id=$1 AND token_hash=$2 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",
        [clusterID, digest(token)],
      )
    ).rows[0];
    if (!row) throw new HostingError(401, "Enrollment is invalid.");
    if (
      (
        await db.query(
          "SELECT 1 FROM webdock_auth.hosting_agent WHERE cluster_id=$1 AND NOT revoked",
          [clusterID],
        )
      ).rowCount
    )
      throw new HostingError(
        409,
        "Revoke the existing agent before replacement.",
      );
    const owner=(await db.query("SELECT ownership,dedicated_customer_id FROM webdock_auth.hosting_cluster WHERE id=$1",[clusterID])).rows[0];
    if(owner?.ownership==='tenant' && !(await byokPolicy(db,owner.dedicated_customer_id)).kubernetes)throw new HostingError(403,'Own infrastructure is disabled.');
    const c = (
      await db.query(
        "UPDATE webdock_auth.hosting_cluster SET generation=generation+1,revision=revision+1,verified=false WHERE id=$1 RETURNING generation",
        [clusterID],
      )
    ).rows[0];
    const credential = randomBytes(32).toString("base64url");
    await db.query(
      `INSERT INTO webdock_auth.hosting_agent(cluster_id,credential_hash,generation) VALUES($1,$2,$3)
 ON CONFLICT(cluster_id) DO UPDATE SET credential_hash=$2,generation=$3,revoked=false,last_sequence=-1,last_seen=NULL,observation=NULL`,
      [clusterID, digest(credential), c.generation],
    );
    await db.query(
      "UPDATE webdock_auth.hosting_enrollment SET consumed_at=now() WHERE cluster_id=$1 AND consumed_at IS NULL",
      [clusterID],
    );
    return { clusterID, generation: c.generation, credential };
  });
}
export async function reportCluster(agent: Agent, input: unknown) {
  const observation = observationSchema.parse(input);
  const time = Date.parse(observation.observedAt);
  if (
    time > Date.now() + 30000 ||
    time < Date.now() - 90000 ||
    observation.generation !== agent.generation
  )
    throw new HostingError(
      409,
      "Observation is stale or belongs to another generation.",
    );
  return transaction(async (db) => {
    await verifyAgent(db, agent);
    const changed = await db.query(
      "UPDATE webdock_auth.hosting_agent SET observation=$2,last_seen=now(),last_sequence=$3 WHERE cluster_id=$1 AND last_sequence<$3 AND generation=$4 AND NOT revoked RETURNING cluster_id",
      [
        agent.clusterID,
        JSON.stringify(observation),
        observation.sequence,
        agent.generation,
      ],
    );
    if (!changed.rowCount)
      throw new HostingError(
        409,
        "Observation sequence was already processed.",
      );
    return { accepted: true };
  });
}
export async function clusterView(db: Connection, id: string) {
  const c = (
    await db.query(
      `SELECT c.id,c.name,c.ownership,c.provider,c.country,c.region,c.location_evidence AS "locationEvidence",c.dedicated_customer_id AS "dedicatedCustomerID",c.revision,c.verified,c.capacity,c.verification_evidence AS "verificationEvidence",a.revoked,a.last_seen AS "lastSeen",a.observation
 FROM webdock_auth.hosting_cluster c LEFT JOIN webdock_auth.hosting_agent a ON a.cluster_id=c.id WHERE c.id=$1`,
      [id],
    )
  ).rows[0];
  if (!c) throw new HostingError(404, "Cluster is unavailable.");
  const fresh =
    c.lastSeen && Date.now() - new Date(c.lastSeen).getTime() < 90000;
  return {
    ...c,
    state: c.revoked
      ? "revoked"
      : !c.lastSeen
        ? "unconnected"
        : fresh
          ? "connected"
          : "stale",
    workloadReady: !!c.verified && !!fresh && !c.revoked,
    lastSeen: c.lastSeen?.toISOString() ?? null,
  };
}
