import { executeAppCommand } from "./apps";
import {
  HostingError,
  setupCommandSchema,
  setupSteps,
  type HostingActor,
  type SetupView,
  type SetupConfiguration,
  type SetupResources,
  type SetupPreview,
  type SetupProgress,
} from "@webdock/hosting-contracts";
import { transaction, audit } from "./db";
import { authorizeHosting } from "./authorization";
import { replay, recordResult } from "./operations";
import {
  openEnvironment,
  sealEnvironment,
  patchEnvironment,
} from "./environment";
import { previewProjectSetup, assertSetupConfirmation } from "./setup-preview";
export type SetupRow = {
  id: string;
  customer_id: string;
  project_id: string;
  subject: string;
  actor: HostingActor | null;
  configuration: SetupConfiguration;
  environment_encrypted: string | null;
  revision: number;
  state: SetupView["state"];
  preview: SetupPreview | null;
  confirmed_preview_id: string | null;
  resources: SetupResources;
  steps: SetupProgress[];
  reason: string | null;
  generation: number;
  lease_until: Date | null;
};
export function setupView(row: SetupRow): SetupView {
  return {
    id: row.id,
    projectID: row.project_id,
    revision: row.revision,
    state: row.state,
    configuration: row.configuration,
    environmentNames: Object.keys(
      openEnvironment("setup:" + row.id, row.environment_encrypted),
    ),
    resources: row.resources,
    steps: row.steps,
    preview: row.preview,
    reason: row.reason,
  };
}
export async function readSetup(
  actor: HostingActor,
  projectID: string,
  id: string,
  write = false,
): Promise<SetupRow> {
  return transaction(async (db) => {
    await authorizeHosting(actor, { projectID, write }, db);
    const row = (
      await db.query(
        "SELECT * FROM webdock_auth.hosting_setup WHERE id=$1 AND project_id=$2",
        [id, projectID],
      )
    ).rows[0];
    if (!row) throw new HostingError(404, "Project setup is unavailable.");
    return row;
  });
}
export async function executeProjectSetup(actor: HostingActor, raw: unknown) {
  const cmd = setupCommandSchema.parse(raw);
  if (cmd.action === "setup.options" || cmd.action === "setup.inspectSource")
    return (await import("./setup-source")).executeSetupSource(actor, cmd);
  if (cmd.action === "setup.get")
    return setupView(await readSetup(actor, cmd.projectID, cmd.setupID));
  if (cmd.action === "setup.list")
    return transaction(async (db) => {
      await authorizeHosting(actor, { projectID: cmd.projectID }, db);
      return {
        docs: (
          await db.query(
            "SELECT * FROM webdock_auth.hosting_setup WHERE project_id=$1 ORDER BY updated_at DESC,id DESC LIMIT $2 OFFSET $3",
            [cmd.projectID, cmd.limit, (cmd.page - 1) * cmd.limit],
          )
        ).rows.map(setupView),
      };
    });
  if (cmd.action === "setup.preview") {
    const saved = await readSetup(actor, cmd.projectID, cmd.setupID, true);
    if (saved.revision !== cmd.revision || saved.state === "running")
      throw new HostingError(
        409,
        "Setup changed. Review the current configuration.",
      );
    if (
      saved.configuration.database.mode === "new" &&
      !saved.resources.databaseID &&
      saved.preview?.offers[0]
    ) {
      const existing = await transaction(async (db) => {
        await authorizeHosting(
          actor,
          { projectID: cmd.projectID, write: true },
          db,
        );
        return (
          await db.query(
            "SELECT d.id FROM webdock_auth.hosting_database d JOIN webdock_auth.hosting_database_order o ON o.id=d.order_id WHERE o.offer_id=$1 AND d.project_id=$2",
            [saved.preview!.offers[0].id, cmd.projectID],
          )
        ).rows[0];
      });
      if (existing) saved.resources.databaseID = existing.id;
    }
    const preview = await previewProjectSetup(actor, {
      id: saved.id,
      projectID: saved.project_id,
      revision: saved.revision,
      configuration: saved.configuration,
      databaseID: saved.resources.databaseID,
      appID: saved.resources.appID,
    });
    return transaction(async (db) => {
      await authorizeHosting(
        actor,
        { projectID: cmd.projectID, write: true },
        db,
      );
      const row = (
        await db.query(
          "UPDATE webdock_auth.hosting_setup SET preview=$3,resources=$4,state='awaiting-confirmation',updated_at=now(),reason=NULL WHERE id=$1 AND revision=$2 AND state<>'running' RETURNING *",
          [
            saved.id,
            cmd.revision,
            JSON.stringify(preview),
            JSON.stringify(saved.resources),
          ],
        )
      ).rows[0];
      if (!row)
        throw new HostingError(
          409,
          "Setup changed. Review the current configuration.",
        );
      return setupView(row);
    });
  }
  return transaction(async (db) => {
    const access = await authorizeHosting(
      actor,
      { projectID: cmd.projectID, write: true },
      db,
    );
    if (
      process.env.DATABASE_RLS_SECRET &&
      !(
        await db.query(
          "SELECT webdock_rls.setup_project_available($1) AS allowed",
          [cmd.projectID],
        )
      ).rows[0]?.allowed
    )
      throw new HostingError(
        409,
        "This project is being deleted. Setup cannot continue.",
      );
    const request = await replay(db, actor, cmd.idempotencyKey, cmd);
    if (request.existing) return request.existing.result as SetupView;
    let row: SetupRow | undefined = cmd.setupID
      ? (
          await db.query(
            "SELECT * FROM webdock_auth.hosting_setup WHERE id=$1 AND project_id=$2 FOR UPDATE",
            [cmd.setupID, cmd.projectID],
          )
        ).rows[0]
      : undefined;
    if (cmd.setupID && !row)
      throw new HostingError(404, "Project setup is unavailable.");
    if ((row?.revision ?? 0) !== cmd.revision)
      throw new HostingError(
        409,
        "Setup changed. Review the current configuration.",
      );
    if (cmd.action === "setup.save") {
      if (row && (row.state === "running" || Object.keys(row.resources).length))
        throw new HostingError(
          409,
          "Use application settings for changes after provisioning has started.",
        );
      const id =
        row?.id ??
        (await db.query("SELECT webdock_auth.next_snowflake() AS id")).rows[0]
          .id;
      const environment = sealEnvironment(
        "setup:" + id,
        patchEnvironment(
          openEnvironment("setup:" + id, row?.environment_encrypted),
          cmd.environment ?? [],
        ),
      );
      row = (
        await db.query(
          `INSERT INTO webdock_auth.hosting_setup(id,customer_id,project_id,subject,configuration,environment_encrypted,steps) VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(id) DO UPDATE SET configuration=$5,environment_encrypted=$6,revision=hosting_setup.revision+1,state='draft',preview=NULL,confirmed_preview_id=NULL,reason=NULL,updated_at=now() RETURNING *`,
          [
            id,
            access.customerID,
            cmd.projectID,
            actor.subject,
            JSON.stringify(cmd.configuration),
            environment,
            JSON.stringify(
              setupSteps.map((name) => ({
                name,
                state: "pending",
                operationID: null,
                reason: null,
              })),
            ),
          ],
        )
      ).rows[0];
    } else {
      if (!row?.preview)
        throw new HostingError(409, "Review the setup before deploying.");
      if (cmd.action === "setup.confirm") {
        assertSetupConfirmation({
          setupRevision: row.revision,
          submittedRevision: cmd.revision,
          previewID: row.preview.id,
          submittedPreviewID: cmd.previewID,
          expiresAt: new Date(row.preview.expiresAt),
          now: new Date(),
          requiredOfferIDs: row.preview.offers.map((o) => o.id),
          acceptedOfferIDs: cmd.acceptedOfferIDs,
        });
        if (row.preview.blockers.length)
          throw new HostingError(409, row.preview.blockers[0]);
        if (
          row.confirmed_preview_id === cmd.previewID &&
          ["running", "ready"].includes(row.state)
        )
          return setupView(row);
      } else if (
        !row.confirmed_preview_id ||
        !["blocked", "failed"].includes(row.state)
      )
        throw new HostingError(
          409,
          "Only an interrupted confirmed setup can be resumed.",
        );
      if (cmd.action === "setup.resume") {
        const interrupted = row.steps.find((s) =>
          ["blocked", "failed"].includes(s.state),
        );
        if (interrupted && ["build", "release"].includes(interrupted.name)) {
          interrupted.attempt = (interrupted.attempt ?? 0) + 1;
          if (interrupted.name === "build") {
            delete row.resources.buildID;
            delete row.resources.releaseID;
          }
          if (
            interrupted.name === "release" &&
            row.configuration.source.kind !== "git" &&
            row.resources.operationID
          ) {
            const operation = (
              await db.query(
                "SELECT status FROM webdock_auth.hosting_operation WHERE id=$1 AND project_id=$2",
                [row.resources.operationID, row.project_id],
              )
            ).rows[0];
            if (operation?.status === "needs-reconciliation")
              await executeAppCommand(
                actor,
                {
                  action: "apps.reconcile",
                  appID: row.resources.appID!,
                  idempotencyKey:
                    "setup-" + row.id + "-recover-" + interrupted.attempt,
                },
                db,
              );
            else if (operation?.status === "failed")
              delete row.resources.operationID;
          }
          let reset = false;
          for (const step of row.steps) {
            if (step === interrupted) reset = true;
            if (reset) {
              step.state = "pending";
              step.reason = null;
              step.operationID = null;
            }
          }
        }
        await db.query(
          "UPDATE webdock_auth.hosting_setup SET steps=$2,resources=$3 WHERE id=$1",
          [row.id, JSON.stringify(row.steps), JSON.stringify(row.resources)],
        );
      }
      if (
        row.configuration.database.mode === "new" &&
        !row.resources.databaseID &&
        new Date(row.preview.expiresAt) <= new Date()
      )
        throw new HostingError(409, "Setup preview expired. Review it again.");
      row = (
        await db.query(
          "UPDATE webdock_auth.hosting_setup SET actor=$2,confirmed_preview_id=preview->>'id',state='running',reason=NULL,lease_until=NULL,generation=generation+1,next_attempt_at=now(),updated_at=now() WHERE id=$1 RETURNING *",
          [row.id, JSON.stringify(actor)],
        )
      ).rows[0];
    }
    const result = setupView(row!);
    await recordResult(
      db,
      actor,
      cmd.idempotencyKey,
      request.hash,
      cmd.action,
      result,
      { customerID: access.customerID, projectID: cmd.projectID },
    );
    await audit(db, actor, cmd.action, row!.id);
    return result;
  });
}
