import {
  HostingError,
  setupCommandSchema,
  type HostingActor,
} from "@webdock/hosting-contracts";
import { transaction } from "./db";
import { authorizeHosting } from "./authorization";
import { executeGitDeployment } from "./git-deployments";
import { executeDatabaseCommand } from "./databases";
import { limits } from "./allowances";
export async function executeSetupSource(actor: HostingActor, raw: unknown) {
  const cmd = setupCommandSchema.parse(raw);
  if (cmd.action !== "setup.options")
    throw new HostingError(
      409,
      "Save the source configuration before inspecting this repository.",
    );
  const context = await transaction(async (db) => {
    const access = await authorizeHosting(
      actor,
      { projectID: cmd.projectID },
      db,
    );
    const project = (
      await db.query(
        'SELECT p.name,c.name AS "customerName" FROM webdock_admin.projects p JOIN webdock_admin.customers c ON c.id=p.customer_id WHERE p.id=$1',
        [cmd.projectID],
      )
    ).rows[0];
    const clusters = access.operator
      ? (
          await db.query(
            "SELECT id,name,country,region FROM webdock_auth.hosting_cluster WHERE verified AND ownership='platform' ORDER BY name LIMIT 100",
          )
        ).rows
      : [];
    const mail = (
      await db.query(
        'SELECT c.id,c.kind,c.state,d.id AS "domainID",d.domain,d.status FROM webdock_auth.mail_connection c LEFT JOIN webdock_auth.mail_connection_domain b ON b.connection_id=c.id LEFT JOIN webdock_auth.mail_sender_domain d ON d.id=b.domain_id AND d.deleted_at IS NULL WHERE c.customer_id=$1 AND c.deleted_at IS NULL ORDER BY c.id,d.domain',
        [access.customerID],
      )
    ).rows;
    return {
      project: {
        ...project,
        projectID: cmd.projectID,
        customerID: access.customerID!,
        configured: Boolean(access.project?.provider),
        provider: access.project?.provider,
        canManage:
          access.canWrite &&
          (access.operator || access.project?.mode === "selfservice"),
        canAssignHosting: access.operator,
      },
      clusters,
      mail,
      allowances: await limits(db, access.customerID!, cmd.projectID, "k3s"),
    };
  });
  const [connections, databases, plans] = await Promise.all([
    executeGitDeployment(actor, {
      action: "git.connections.list",
      customerID: context.project.customerID,
    }),
    executeDatabaseCommand(actor, {
      action: "databases.list",
      projectID: cmd.projectID,
    }),
    executeDatabaseCommand(actor, {
      action: "databases.plans.list",
      projectID: cmd.projectID,
    }),
  ]);
  return { ...context, connections: connections.docs, databases, plans };
}
