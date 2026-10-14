import {
  HostingError,
  serviceCommandSchema,
  type HostingActor,
  type ServiceBindingView,
} from "@webdock/hosting-contracts";
import { authorizeHosting } from "./authorization";
import { transaction, planLock, audit } from "./db";
import { replay, recordResult } from "./operations";
import { openEnvironment, sealEnvironment } from "./environment";
import { encryptMailSecret } from "../platform/platform";
import { databaseBindingMaterial } from "./database-binding";
import { openBinding } from "./binding-runtime";
import { executeAppCommand } from "./apps";
import { limits } from "./allowances";

function view(row: Record<string, any>): ServiceBindingView {
  return {
    id: row.id,
    projectID: row.project_id,
    appID: row.app_id,
    service: row.service,
    revision: row.revision,
    observedRevision: row.observed_revision,
    credentialRevision: row.credential_revision,
    state: row.state,
    reason: row.reason,
  };
}
export async function executeServiceBinding(actor: HostingActor, raw: unknown) {
  const cmd = serviceCommandSchema.parse(raw);
  return transaction(async (db) => {
    const access = await authorizeHosting(
      actor,
      { projectID: cmd.projectID, write: cmd.action !== "services.list" },
      db,
    );
    if (cmd.action === "services.list") {
      const rows = (
        await db.query(
          "SELECT * FROM webdock_auth.hosting_service_binding WHERE project_id=$1 AND customer_id=$2 AND ($3::text IS NULL OR app_id=$3) ORDER BY id",
          [cmd.projectID, access.customerID, cmd.appID ?? null],
        )
      ).rows;
      for (const row of rows)
        if (
          row.service.kind === "postgres" &&
          row.secret_encrypted &&
          !["disconnected", "disconnecting"].includes(row.state)
        ) {
          const material = openBinding(row.id, row.secret_encrypted);
          const current = (
            await db.query(
              "SELECT d.state,d.confirmed_credential_revision,d.credential_revision,b.ca_certificate,b.endpoint_ready FROM webdock_auth.hosting_database d JOIN webdock_auth.hosting_database_backend b ON b.id=d.backend_id WHERE d.id=$1 AND d.project_id=$2 AND d.customer_id=$3",
              [row.service.databaseID, cmd.projectID, access.customerID],
            )
          ).rows[0];
          if (
            !current ||
            current.state !== "ready" ||
            !current.endpoint_ready ||
            current.credential_revision !== row.credential_revision ||
            current.confirmed_credential_revision !== row.credential_revision ||
            current.ca_certificate !== material.runtime.caCertificate
          ) {
            row.state = "blocked";
            row.reason = "Refresh the database connection before deployment.";
          }
        }
      return rows.map(view);
    }
    await planLock(db, access.customerID!);
    const request = await replay(db, actor, cmd.idempotencyKey, cmd);
    if (request.existing) return request.existing.result as ServiceBindingView;
    let row =
      cmd.action === "services.bind"
        ? (
            await db.query(
              "SELECT * FROM webdock_auth.hosting_service_binding WHERE project_id=$1 AND app_id=$2 AND variable=$3 AND state<>'disconnected' FOR UPDATE",
              [cmd.projectID, cmd.appID, cmd.service.variable],
            )
          ).rows[0]
        : (
            await db.query(
              "SELECT * FROM webdock_auth.hosting_service_binding WHERE id=$1 AND project_id=$2 FOR UPDATE",
              [cmd.bindingID, cmd.projectID],
            )
          ).rows[0];
    if (cmd.action !== "services.bind" && !row)
      throw new HostingError(404, "Service connection is unavailable.");
    if ((row?.revision ?? 0) !== cmd.revision)
      throw new HostingError(
        409,
        "Service connection changed. Refresh before editing.",
      );
    const app = (
      await db.query(
        "SELECT * FROM webdock_auth.hosting_app WHERE id=$1 AND project_id=$2 AND status<>'deleted' FOR UPDATE",
        [
          row?.app_id ?? (cmd.action === "services.bind" ? cmd.appID : null),
          cmd.projectID,
        ],
      )
    ).rows[0];
    if (!app || !access.project?.cluster_id)
      throw new HostingError(404, "Application is unavailable.");
    const environment = openEnvironment(app.id, app.environment_encrypted);
    const service = cmd.action === "services.bind" ? cmd.service : row.service;
    const oldNames = row?.secret_encrypted
      ? Object.keys(openBinding(row.id, row.secret_encrypted).environment)
      : [];
    if (cmd.action === "services.disconnect") {
      for (const name of oldNames) delete environment[name];
      row = (
        await db.query(
          "UPDATE webdock_auth.hosting_service_binding SET state=$2,revision=revision+1,secret_encrypted=NULL,reason=NULL WHERE id=$1 RETURNING *",
          [
            row.id,
            app.lifecycle === "draft" ? "disconnected" : "disconnecting",
          ],
        )
      ).rows[0];
    } else {
      if (service.kind !== "postgres")
        throw new HostingError(409, "Native Mail binding is not configured.");
      const capable = (
        await db.query(
          "SELECT observation->'capabilities'->>'serviceBindingsVersion' AS version FROM webdock_auth.hosting_agent WHERE cluster_id=$1 AND NOT revoked",
          [access.project.cluster_id],
        )
      ).rows[0];
      if (capable?.version !== "1")
        throw new HostingError(
          409,
          "Update the cluster agent before connecting services.",
        );
      if (!row && Object.hasOwn(environment, service.variable))
        throw new HostingError(
          409,
          "An environment variable already uses this name.",
        );
      if (
        !row &&
        (
          await db.query(
            "SELECT count(*)::int AS n FROM webdock_auth.hosting_service_binding WHERE app_id=$1 AND state<>'disconnected'",
            [app.id],
          )
        ).rows[0].n >= 16
      )
        throw new HostingError(
          409,
          "This application already has sixteen service connections.",
        );
      const id =
        row?.id ??
        (await db.query("SELECT webdock_auth.next_snowflake() AS id")).rows[0]
          .id;
      const material = await databaseBindingMaterial(db, {
        databaseID: service.databaseID,
        projectID: cmd.projectID,
        customerID: access.customerID!,
        clusterID: access.project.cluster_id,
        bindingID: id,
        variable: service.variable,
      });
      for (const name of oldNames) delete environment[name];
      Object.assign(environment, material.environment);
      const sealed = encryptMailSecret(material, "hosting-binding:" + id);
      row = (
        await db.query(
          `INSERT INTO webdock_auth.hosting_service_binding(id,customer_id,project_id,app_id,service,variable,credential_revision,secret_encrypted)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET service=$5,credential_revision=$7,secret_encrypted=$8,revision=hosting_service_binding.revision+1,state='pending',reason=NULL RETURNING *`,
          [
            id,
            access.customerID,
            cmd.projectID,
            app.id,
            JSON.stringify(service),
            service.variable,
            material.credentialRevision,
            sealed,
          ],
        )
      ).rows[0];
    }
    const encrypted = sealEnvironment(app.id, environment);
    if (app.lifecycle === "draft")
      await db.query(
        "UPDATE webdock_auth.hosting_app SET environment_encrypted=$2,revision=revision+1 WHERE id=$1",
        [app.id, encrypted],
      );
    else {
      const patch = environment;
      await executeAppCommand(
        actor,
        {
          action: "apps.update",
          appID: app.id,
          revision: app.revision,
          spec: app.spec,
          environment: [
            ...Object.entries(patch).map(([name, value]) => ({ name, value })),
            ...oldNames
              .filter((name) => !(name in patch))
              .map((name) => ({ name, value: null })),
          ],
          subscriptionRevision: (await limits(db, access.customerID!))
            .subscriptionRevision,
          idempotencyKey: "binding-" + row.id + "-" + row.revision,
        },
        db,
      );
    }
    const result = view(row);
    await recordResult(
      db,
      actor,
      cmd.idempotencyKey,
      request.hash,
      cmd.action,
      result,
      { customerID: access.customerID, projectID: cmd.projectID },
    );
    await audit(db, actor, cmd.action, row.id);
    return result;
  });
}
