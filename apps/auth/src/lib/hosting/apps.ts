import {searchPage} from "@webdock/search";
import { createHash } from "node:crypto";
import {
  HostingError,
  resolveAppSpec,
  appDemand,
  hostingDimensions,
  type HostingActor,
  type HostingCommand,
  type AppSpec,
  type HostingDemand,
} from "@webdock/hosting-contracts";
import { authorizeHosting, type Connection } from "./authorization";
import { transaction, planLock, clusterLock, audit } from "./db";
import { checkDemand } from "./reservations";
import { replay, recordResult } from "./operations";
import { totals, limits } from "./allowances";
import {openEnvironment,patchEnvironment,sealEnvironment} from './environment';
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function safeApp(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    projectID: row.project_id,
    revision: row.revision,
    observedRevision: row.observed_revision,
    status: row.status,
    spec: row.spec,
    environmentNames: Object.keys(openEnvironment(row.id,row.environment_encrypted)).sort(),
    operationID: row.operation_id,
    lastError: row.last_error,
    logs: row.logs,
  };
}
async function getApp(db: Connection, id: string) {
  const row = (
    await db.query(
      "SELECT a.*,h.customer_id,h.cluster_id,h.namespace,h.own_images FROM webdock_auth.hosting_app a JOIN webdock_auth.hosting_project h ON h.project_id=a.project_id WHERE a.id=$1",
      [id],
    )
  ).rows[0];
  if (!row) throw new HostingError(404, "Application is unavailable.");
  return row;
}
function deletionPlan(row: Record<string, any>, storage = false) {
  const plan = {
    appID: row.id,
    name: row.name,
    projectID: row.project_id,
    clusterID: row.cluster_id,
    namespace: row.namespace,
    revision: row.revision,
    observedUID: row.observed_uid,
    resources: storage ? ["PersistentVolume", "PersistentVolumeClaim", "Filesystem"] : ["Deployment", "Service", "Secret"],
    persistentData: Boolean(row.spec.volumeBytes),
    volumeBytes: row.spec.volumeBytes ?? 0,
    storagePurged: storage,
    namespaceRetained: true,
  };
  return { plan, planHash: digest(plan) };
}
export async function executeAppCommand(
  actor: HostingActor,
  cmd: HostingCommand,
) {
  return transaction(async (db) => {
    if (cmd.action === "apps.list") {
      const access = await authorizeHosting(
        actor,
        { projectID: cmd.projectID },
        db,
      );
      const matches=cmd.search.trim()?await searchPage(async page=>{const rows=(await db.query(`SELECT id,name FROM webdock_auth.hosting_app WHERE project_id=$1 AND (status<>'deleted' OR COALESCE((spec->>'volumeBytes')::bigint,0)>0) ORDER BY name ${cmd.sort==='-name'?'DESC':'ASC'},id LIMIT 300 OFFSET $2`,[cmd.projectID,(page-1)*300])).rows;return {rows,hasMore:rows.length===300};},r=>r.name,cmd.search,cmd.page,cmd.limit):null;
      const rows = matches?(await db.query(`SELECT * FROM webdock_auth.hosting_app WHERE project_id=$1 AND (status<>'deleted' OR COALESCE((spec->>'volumeBytes')::bigint,0)>0) AND id=ANY($2::varchar[]) ORDER BY name ${cmd.sort==='-name'?'DESC':'ASC'},id`,[cmd.projectID,matches.docs.map(r=>r.id)])).rows:(
        await db.query(
          `SELECT * FROM webdock_auth.hosting_app WHERE project_id=$1 AND (status<>'deleted' OR COALESCE((spec->>'volumeBytes')::bigint,0)>0) AND name ILIKE $2 ORDER BY name ${cmd.sort === "-name" ? "DESC" : "ASC"},id LIMIT $3 OFFSET $4`,
          [
            cmd.projectID,
            `%${cmd.search.replace(/[\\%_]/g, "\\$&")}%`,
            cmd.limit,
            (cmd.page - 1) * cmd.limit,
          ],
        )
      ).rows;
      const count = matches?matches.totalDocs:(
        await db.query(
          "SELECT count(*)::int AS n FROM webdock_auth.hosting_app WHERE project_id=$1 AND (status<>'deleted' OR COALESCE((spec->>'volumeBytes')::bigint,0)>0) AND name ILIKE $2",
          [cmd.projectID, `%${cmd.search.replace(/[\\%_]/g, "\\$&")}%`],
        )
      ).rows[0].n;
      return {
        docs: rows.map(safeApp),
        page: cmd.page,
        limit: cmd.limit,
        totalDocs: count,
        totalPages: Math.ceil(count / cmd.limit),
        subscriptionRevision: (await limits(db, access.customerID!))
          .subscriptionRevision,
        operator: access.operator,
        canManage:
          access.canWrite &&
          (access.operator || access.project?.mode === "selfservice"),
        ownImages: access.operator || access.project?.own_images === true,
      };
    }
    if (!cmd.action.startsWith("apps."))
      throw new HostingError(400, "Unknown application action.");
    const action = cmd.action;
    let row = "appID" in cmd ? await getApp(db, cmd.appID) : null;
    const projectID =
      row?.project_id ?? ("projectID" in cmd ? cmd.projectID : undefined);
    if (!projectID)
      throw new HostingError(404, "Application project is unavailable.");
    const read = ["apps.get", "apps.deletion", "apps.storageDeletion", "apps.logs"].includes(action);
    const access = await authorizeHosting(
      actor,
      {
        projectID,
        write: !read,
        live: action === "apps.logs",
        operator: ["apps.delete", "apps.deletion", "apps.storageDeletion", "apps.purgeStorage", "apps.reconcile"].includes(
          action,
        ),
      },
      db,
    );
    if (action === "apps.get")
      return {
        ...safeApp(row!),
        canRequestLogs: access.liveReads,
        subscriptionRevision: (await limits(db, access.customerID!))
          .subscriptionRevision,
        operator: access.operator,
        canManage:
          access.canWrite &&
          (access.operator || access.project?.mode === "selfservice"),
      };
    if (action === "apps.deletion") return deletionPlan(row!);
    if (action === "apps.storageDeletion") {
      if (row?.status !== 'deleted') throw new HostingError(409,'Delete the application before removing retained storage.');
      if (!row.spec.volumeBytes) return {removed:true,name:row.name};
      return deletionPlan(row, true);
    }
    if (!("idempotencyKey" in cmd))
      throw new HostingError(400, "Idempotency key is required.");
    const customerID = access.customerID!,
      clusterID = access.project?.cluster_id;
    if (!clusterID)
      throw new HostingError(
        409,
        "Managed application execution requires k3s.",
      );
    await planLock(db, customerID);
    await clusterLock(db, clusterID);
    await authorizeHosting(
      actor,
      {
        projectID,
        write: !read,
        live: action === "apps.logs",
        operator: ["apps.delete", "apps.purgeStorage", "apps.reconcile"].includes(action),
      },
      db,
    );
    if (row) row = await getApp(db, row.id);
    const request = await replay(db, actor, cmd.idempotencyKey, cmd);
    if (request.existing) {
      if (action === "apps.reconcile") return request.existing.result;
      return {
        id: request.existing.id,
        appID: request.existing.app_id,
        status: request.existing.status,
        revision: request.existing.target_revision,
      };
    }
    if (row?.status === "deleted" && !["apps.purgeStorage", "apps.reconcile"].includes(action))
      throw new HostingError(409, "Application is deleted.");
    if (action === "apps.reconcile") {
      const op = (
        await db.query(
          "SELECT * FROM webdock_auth.hosting_operation WHERE id=$1 AND status IN ('running','needs-reconciliation') FOR UPDATE",
          [row!.operation_id],
        )
      ).rows[0];
      if (
        !op ||
        (op.status === "running" &&
          new Date(op.lease_until).getTime() > Date.now())
      )
        throw new HostingError(
          409,
          "No expired operation is available for reconciliation.",
        );
      await db.query(
        "UPDATE webdock_auth.hosting_operation SET status='queued' WHERE id=$1",
        [op.id],
      );
      const result = { id: op.id, appID: row!.id, status: "queued" };
      await recordResult(
        db,
        actor,
        cmd.idempotencyKey,
        request.hash,
        action,
        result,
        { customerID, projectID, clusterID },
      );
      await audit(db, actor, action, row!.id, "queued");
      return result;
    }
    const busy = (
      await db.query(
        "SELECT id,status,app_id FROM webdock_auth.hosting_operation WHERE project_id=$1 AND status IN ('queued','running','needs-reconciliation') FOR UPDATE",
        [projectID],
      )
    ).rows;
    if (busy.length) {
      const diagnostic =
        action === "apps.logs" &&
        busy.every((r) => r.status === "needs-reconciliation");
      if (!diagnostic) {
        if (
          !access.operator ||
          !row ||
          busy.some(
            (r) => r.status !== "needs-reconciliation" || r.app_id !== row.id,
          )
        )
          throw new HostingError(
            409,
            "Wait for the current project operation or reconcile it first.",
          );
        for (const op of busy)
          await db.query(
            "UPDATE webdock_auth.hosting_operation SET status='failed' WHERE id=$1",
            [op.id],
          );
      }
    }
    if (row && "revision" in cmd && cmd.revision !== row.revision)
      throw new HostingError(
        409,
        "Application changed. Refresh before editing.",
      );
    let spec: AppSpec = row?.spec;
    if (action === "apps.create" || action === "apps.update")
      spec = resolveAppSpec(cmd.spec);
    if (action === "apps.rollback") {
      if (!row?.previous_spec)
        throw new HostingError(
          409,
          "No previous application revision is available.",
        );
      spec = resolveAppSpec(row.previous_spec);
    }
    if (action === "apps.scale") spec = { ...spec, replicas: cmd.replicas };
    if (action === "apps.stop") spec = { ...spec, replicas: 0 };
    if (action === "apps.start")
      spec = { ...spec, replicas: Math.max(1, spec.replicas) };
    let environment = row ? openEnvironment(row.id, action === 'apps.rollback' ? row.previous_environment_encrypted : row.environment_encrypted) : {};
    if ((action === 'apps.create' || action === 'apps.update') && cmd.environment)
      environment = patchEnvironment(environment,cmd.environment);
    spec = resolveAppSpec(spec);
    if (row && (spec.volumeBytes ?? 0) !== (row.spec.volumeBytes ?? 0)) throw new HostingError(409,'Persistent storage size is fixed at application creation.');
    const storageRequired=Boolean(spec.volumeBytes);
    if (storageRequired) {
      const capable=(await db.query("SELECT observation FROM webdock_auth.hosting_agent WHERE cluster_id=$1",[clusterID])).rows[0]?.observation;
      if (capable?.capabilities?.storageVersion !== 1 || (!capable.capabilities.storage && !['apps.delete','apps.purgeStorage','apps.logs'].includes(action))) throw new HostingError(409,'Verified persistent storage is unavailable on this cluster.');
    }
    const environmentRequired=Boolean(Object.keys(environment).length || row?.environment_encrypted || row?.observed_environment_encrypted);
    if(environmentRequired){
      const capable=(await db.query("SELECT observation->'capabilities'->>'environment' AS enabled FROM webdock_auth.hosting_agent WHERE cluster_id=$1",[clusterID])).rows[0];
      if(capable?.enabled!=='true')throw new HostingError(409,'Update the cluster agent before using environment variables.');
    }
    if (
      spec.template === "custom" &&
      !access.operator &&
      !access.project.own_images
    )
      throw new HostingError(
        403,
        "Custom images are not enabled for this project.",
      );
    const purging = action === "apps.purgeStorage";
    if (purging && (row?.status !== "deleted" || !storageRequired)) throw new HostingError(409,"Delete the application before removing retained storage.");
    const deleting = action === "apps.delete" || purging,
      logging = action === "apps.logs";
    if (deleting) {
      const preview = deletionPlan(row!, purging);
      if (cmd.confirmName !== row!.name || cmd.planHash !== preview.planHash)
        throw new HostingError(
          409,
          "Deletion preview changed. Review the current application.",
        );
    }
    const full = appDemand(purging ? {...spec,volumeBytes:0} : spec, deleting);
    if (!logging) {
      const previous = row
        ? (
            await db.query(
              "SELECT demand,status FROM webdock_auth.hosting_reservation WHERE app_id=$1 AND status<>'released'",
              [row.id],
            )
          ).rows
        : [];
      const old = totals(previous);
      const additional = Object.fromEntries(
        hostingDimensions.map((k) => [
          k,
          k === "replicasPerApp" ? full[k] : Math.max(0, full[k] - old[k]),
        ]),
      ) as HostingDemand;
      const subRevision =
        "subscriptionRevision" in cmd
          ? cmd.subscriptionRevision
          : ((
              await db.query(
                "SELECT revision FROM webdock_auth.tenant_subscription WHERE customer_id=$1",
                [customerID],
              )
            ).rows[0]?.revision ?? 0);
      await checkDemand(db, {
        customerID,
        projectID,
        clusterID,
        provider: "k3s",
        demand: additional,
        subscriptionRevision: subRevision,
      });
      if (!row) {
        if (action !== "apps.create")
          throw new HostingError(400, "Create an application first.");
        row = (
          await db.query(
            "INSERT INTO webdock_auth.hosting_app(project_id,name,spec) VALUES($1,$2,$3) RETURNING *",
            [projectID, cmd.name, JSON.stringify(spec)],
          )
        ).rows[0];
      } else
        await db.query(
          "UPDATE webdock_auth.hosting_app SET previous_spec=CASE WHEN $3 THEN previous_spec ELSE observed_spec END,previous_environment_encrypted=CASE WHEN $3 THEN previous_environment_encrypted ELSE observed_environment_encrypted END,spec=$2,revision=revision+1,status=CASE WHEN $4 THEN 'deleted' ELSE 'pending' END,last_error=NULL WHERE id=$1",
          [row.id, JSON.stringify(spec), deleting, purging],
        );
      row = await getApp(db, row!.id);
      const environmentEncrypted=sealEnvironment(row.id,environment);
      await db.query('UPDATE webdock_auth.hosting_app SET environment_encrypted=$2,logs=NULL WHERE id=$1',[row.id,environmentEncrypted]);
      const desired = {
        appID: row.id,
        projectID,
        clusterID,
        namespace: access.project?.namespace ?? `wd-${projectID}`,
        name: row.name,
        spec,
        revision: row.revision,
        action: purging ? "purge-storage" : deleting ? "delete" : "apply",
        ...(storageRequired ? {storageVersion:1} : {}),
        expectedUID: row.observed_uid ?? null,
        ...(environmentRequired?{environmentVersion:1,environmentEncrypted}:{}),
      };
      const op = (
        await db.query(
          "INSERT INTO webdock_auth.hosting_operation(subject,customer_id,project_id,cluster_id,app_id,action,idempotency_key,payload_hash,status,desired,target_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'queued',$9,$10) RETURNING id,status",
          [
            actor.subject,
            customerID,
            projectID,
            clusterID,
            row.id,
            action,
            cmd.idempotencyKey,
            request.hash,
            JSON.stringify(desired),
            row.revision,
          ],
        )
      ).rows[0];
      await db.query(
        "INSERT INTO webdock_auth.hosting_reservation(operation_id,customer_id,project_id,cluster_id,app_id,demand,status) VALUES($1,$2,$3,$4,$5,$6,'reserved')",
        [
          op.id,
          customerID,
          projectID,
          clusterID,
          row.id,
          JSON.stringify(additional),
        ],
      );
      await db.query(
        "UPDATE webdock_auth.hosting_app SET operation_id=$2 WHERE id=$1",
        [row.id, op.id],
      );
      await audit(db, actor, action, row.id, "queued");
      return { id: op.id, appID: row.id, status: op.status, revision: row.revision };
    }
    const op = (
      await db.query(
        "INSERT INTO webdock_auth.hosting_operation(subject,customer_id,project_id,cluster_id,app_id,action,idempotency_key,payload_hash,status,desired,target_revision) VALUES($1,$2,$3,$4,$5,'apps.logs',$6,$7,'queued',$8,$9) RETURNING id,status",
        [
          actor.subject,
          customerID,
          projectID,
          clusterID,
          row!.id,
          cmd.idempotencyKey,
          request.hash,
          JSON.stringify({
            appID: row!.id,
            projectID,
            clusterID,
            namespace: `wd-${projectID}`,
            revision: row!.revision,
            action: "logs",
            spec,
            ...(storageRequired ? {storageVersion:1} : {}),
            ...(environmentRequired?{environmentVersion:1,environmentEncrypted:row!.environment_encrypted}:{}),
          }),
          row!.revision,
        ],
      )
    ).rows[0];
    await audit(db, actor, action, row!.id, "queued");
    return { id: op.id, appID: row!.id, status: op.status };
  });
}
