import {assertDatabaseMaintenanceAllowed} from "./database-protection";
import { createHash, randomBytes } from "node:crypto";
import {
  HostingError,
  type HostingActor,
  type DatabaseCommand,
} from "@webdock/hosting-contracts";
import type { Connection } from "./authorization";
import { databaseAccess, databaseView } from "./databases";
import { clusterLock, audit } from "./db";
import {
  enqueueDatabase,
  databaseCredentials,
  freshDatabaseCluster,
} from "./database-orders";
import { replay, recordResult } from "./operations";
import { encryptMailSecret } from "../platform";
export async function databaseMaintenance(
  db: Connection,
  actor: HostingActor,
  cmd: DatabaseCommand,
) {
  if (!("databaseID" in cmd) || !cmd.databaseID)
    throw new HostingError(400, "Database target required.");
  const preview =
    cmd.action === "databases.deletionPreview" ||
    cmd.action === "databases.purgePreview";
  const destructive = [
    "databases.delete",
    "databases.purge",
    "databases.reconcile",
  ].includes(cmd.action);
  const row = await databaseAccess(
    db,
    actor,
    cmd.databaseID,
    !preview,
    preview || destructive,
  );
  assertDatabaseMaintenanceAllowed(row.id,cmd.action);
  const backend = (
    await db.query(
      "SELECT * FROM webdock_auth.hosting_database_backend WHERE id=$1",
      [row.backend_id],
    )
  ).rows[0];
  await clusterLock(db, backend.cluster_id);
  const current = (
    await db.query(
      "SELECT * FROM webdock_auth.hosting_database WHERE id=$1 FOR UPDATE",
      [row.id],
    )
  ).rows[0];
  if (preview) {
    const kind = cmd.action === "databases.purgePreview" ? "purge" : "delete";
    const plan = {
      databaseID: row.id,
      name: row.name,
      revision: current.revision,
      kind,
      backendID: backend.id,
      cnpgUID: backend.cnpg_uid,
      scope:
        row.kind === "shared" ? "this-logical-database" : "this-installation",
      backupStatus: "not-configured",
      retainedUntil: current.retained_until?.toISOString() ?? null,
    };
    const hash = createHash("sha256")
      .update(JSON.stringify(plan) + randomBytes(24).toString("hex"))
      .digest("hex");
    const expiresAt = new Date(Date.now() + 300000).toISOString();
    await db.query(
      `INSERT INTO webdock_auth.hosting_database_preview(database_id,session_id,kind,plan_hash,revision,expires_at)
   VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(database_id,session_id,kind) DO UPDATE SET plan_hash=excluded.plan_hash,revision=excluded.revision,expires_at=excluded.expires_at`,
      [row.id, actor.sessionID, kind, hash, current.revision, expiresAt],
    );
    return { ...plan, planHash: hash, expiresAt };
  }
  if (!("idempotencyKey" in cmd) || !("revision" in cmd))
    throw new HostingError(400, "Fenced database command required.");
  const prior = await replay(db, actor, cmd.idempotencyKey, cmd);
  if (prior.existing) return prior.existing.result;
  if (current.revision !== cmd.revision)
    throw new HostingError(409, "Database changed. Refresh and try again.");
  if (cmd.action === "databases.requestCancellation") {
    await db.query(
      "UPDATE webdock_auth.hosting_database_order SET cancellation_requested_at=COALESCE(cancellation_requested_at,now()) WHERE id=$1",
      [current.order_id],
    );
  } else if (cmd.action === "databases.reconcile") {
    const pending = (
      await db.query(
        `SELECT o.id,j.backend_id,j.checkpoint FROM webdock_auth.hosting_database_job j JOIN webdock_auth.hosting_operation o ON o.id=j.operation_id
   WHERE j.database_id=$1 AND o.status='needs-reconciliation' ORDER BY o.created_at DESC LIMIT 1 FOR UPDATE OF o,j`,
        [row.id],
      )
    ).rows[0];
    const actualBackend = pending
      ? (
          await db.query(
            "SELECT cnpg_uid FROM webdock_auth.hosting_database_backend WHERE id=$1",
            [pending.backend_id],
          )
        ).rows[0]
      : null;
    if (!pending || !actualBackend?.cnpg_uid || !pending.checkpoint)
      throw new HostingError(
        409,
        "Operator must inspect the unconfirmed installation before reconciliation.",
      );
    // Reconciliation observes the previous intent. It never replays its unsafe mutation.
    await db.query(
      "UPDATE webdock_auth.hosting_database_job SET checkpoint=$2 WHERE operation_id=$1",
      [
        pending.id,
        JSON.stringify({
          ...pending.checkpoint,
          phase: "observing",
          cnpgUID: actualBackend.cnpg_uid,
        }),
      ],
    );
    await db.query(
      "UPDATE webdock_auth.hosting_operation SET status='queued',actor_session=$2 WHERE id=$1",
      [pending.id, actor.sessionID],
    );
  } else {
    await freshDatabaseCluster(db, backend.cluster_id);
    const busy = (
      await db.query(
        "SELECT 1 FROM webdock_auth.hosting_database_job j JOIN webdock_auth.hosting_operation o ON o.id=j.operation_id WHERE j.database_id=$1 AND o.status IN ('queued','running','needs-reconciliation')",
        [row.id],
      )
    ).rowCount;
    if (busy)
      throw new HostingError(
        409,
        "Finish or reconcile the current database operation first.",
      );
    let action: string, state: string;
    if (cmd.action === "databases.pause") {
      if (!["ready", "degraded"].includes(current.state))
        throw new HostingError(409, "Only a ready database can be paused.");
      action = "pause";
      state = "pausing";
    } else if (cmd.action === "databases.resume") {
      if (current.state !== "paused")
        throw new HostingError(409, "Only a paused database can be resumed.");
      action = "resume";
      state = "resuming";
    } else if (cmd.action === "databases.restart") {
      if (row.kind === "shared")
        throw new HostingError(
          409,
          "Shared databases cannot restart their pool.",
        );
      if (!["ready", "degraded"].includes(current.state))
        throw new HostingError(409, "Only a ready instance can be restarted.");
      action = "restart";
      state = "updating";
    } else if (cmd.action === "databases.rotateCredentials") {
      if (current.state !== "ready")
        throw new HostingError(
          409,
          "Only a ready database can rotate credentials.",
        );
      const revision = current.credential_revision + 1;
      await db.query(
        "UPDATE webdock_auth.hosting_database SET credential_revision=$2,credentials_encrypted=$3 WHERE id=$1",
        [
          row.id,
          revision,
          encryptMailSecret(
            databaseCredentials(),
            `database:${row.id}:${revision}`,
          ),
        ],
      );
      action = "rotateCredentials";
      state = "updating";
    } else if (
      cmd.action === "databases.delete" ||
      cmd.action === "databases.purge"
    ) {
      action = cmd.action === "databases.delete" ? "delete" : "purge";
      state = action === "delete" ? "deleting" : "retained";
      const proof = (
        await db.query(
          "SELECT * FROM webdock_auth.hosting_database_preview WHERE database_id=$1 AND session_id=$2 AND kind=$3 FOR UPDATE",
          [row.id, actor.sessionID, action],
        )
      ).rows[0];
      if (
        !proof ||
        proof.plan_hash !== cmd.planHash ||
        proof.revision !== current.revision ||
        new Date(proof.expires_at).getTime() <= Date.now() ||
        cmd.confirmName !== row.name
      )
        throw new HostingError(
          409,
          "Refresh and confirm the database deletion preview.",
        );
      if (
        action === "purge" &&
        (current.state !== "retained" ||
          !current.retained_until ||
          new Date(current.retained_until).getTime() > Date.now())
      )
        throw new HostingError(409, "Database retention has not expired.");
      if (action === "delete" && ["retained", "purged"].includes(current.state))
        throw new HostingError(409, "Database is already retained or purged.");
      await db.query(
        "DELETE FROM webdock_auth.hosting_database_preview WHERE database_id=$1",
        [row.id],
      );
    } else
      throw new HostingError(
        409,
        "Database maintenance requires an accepted matching upgrade order.",
      );
    await db.query(
      "UPDATE webdock_auth.hosting_database SET revision=revision+1,state=$2 WHERE id=$1",
      [row.id, state],
    );
    await enqueueDatabase(
      db,
      actor,
      row.backend_id,
      row.id,
      action,
      current.revision + 1,
    );
  }
  const result = await databaseView(db, row.id);
  await recordResult(
    db,
    actor,
    cmd.idempotencyKey,
    prior.hash,
    cmd.action,
    result,
    {
      customerID: row.customer_id,
      projectID: row.project_id,
      clusterID: backend.cluster_id,
    },
  );
  await audit(db, actor, cmd.action, row.id);
  return result;
}
