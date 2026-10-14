import {
  HostingError,
  type HostingActor,
  type GitDeploymentCommand,
} from "@webdock/hosting-contracts";
import { authorizeHosting, type Connection } from "./authorization";
import { transaction, audit } from "./db";
import {
  resolveGitVercelCredential,
  prepareGitVercelBuild,
} from "./git-vercel";
type Target = Extract<GitDeploymentCommand, { action: "git.targets.bind" }>;
type Verify = (
  db: Connection,
  target: { customerID: string; projectID: string; targetID: string },
) => Promise<void>;
const verify: Verify = async (db, target) => {
  const credential = await resolveGitVercelCredential(db, target);
  await prepareGitVercelBuild(credential, {
    buildEnvironment: {},
    allowedBuildVariables: [],
  });
};
/** Explicit adoption of an already configured target, checked transactionally before binding is retained. */
export async function bindGitTarget(
  actor: HostingActor,
  cmd: Target,
  verifyTarget: Verify = verify,
) {
  return transaction(async (db) => {
    const access = await authorizeHosting(
      actor,
      {
        projectID: cmd.projectID,
        write: true,
        operator: cmd.mode === "platform",
      },
      db,
    );
    if (access.project?.provider !== "vercel")
      throw new HostingError(409, "Configure a Vercel hosting project first.");
    let teamID: string;
    if (cmd.mode === "byok") {
      const connection = (
        await db.query(
          "SELECT team_id,projects FROM webdock_auth.hosting_vercel WHERE customer_id=$1 FOR SHARE",
          [access.customerID],
        )
      ).rows[0];
      if (!connection || !connection.projects.includes(cmd.targetID))
        throw new HostingError(
          403,
          "Select this project in the customer Vercel connection first.",
        );
      teamID = connection.team_id;
    } else {
      teamID = process.env.WEBDOCK_GIT_VERCEL_TEAM_ID ?? "";
      if (!/^team_[A-Za-z0-9]+$/.test(teamID))
        throw new HostingError(
          409,
          "Configure the platform Vercel team first.",
        );
    }
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      "git-vercel-target:" + teamID + ":" + cmd.targetID,
    ]);
    const existing = (
      await db.query(
        "SELECT * FROM webdock_auth.git_vercel_target WHERE (team_id=$1 AND target_id=$2) OR (project_id=$3 AND target_id=$2) FOR UPDATE",
        [teamID, cmd.targetID, cmd.projectID],
      )
    ).rows[0];
    if (
      existing &&
      (existing.customer_id !== access.customerID ||
        existing.project_id !== cmd.projectID ||
        existing.mode !== cmd.mode ||
        existing.team_id !== teamID)
    )
      throw new HostingError(
        409,
        "This Vercel target is already bound to another hosting project or connection.",
      );
    if (!existing)
      await db.query(
        "INSERT INTO webdock_auth.git_vercel_target(customer_id,project_id,target_id,team_id,mode) VALUES($1,$2,$3,$4,$5)",
        [access.customerID, cmd.projectID, cmd.targetID, teamID, cmd.mode],
      );
    await verifyTarget(db, {
      customerID: access.customerID!,
      projectID: cmd.projectID,
      targetID: cmd.targetID,
    });
    await audit(db, actor, cmd.action, cmd.projectID);
    return {
      projectID: cmd.projectID,
      targetID: cmd.targetID,
      mode: cmd.mode,
      generation: existing?.generation ?? 1,
    };
  });
}
