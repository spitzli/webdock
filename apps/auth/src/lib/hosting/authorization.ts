import type { PoolClient } from "pg";
import {
  HostingError,
  resourceID,
  type HostingActor,
} from "@webdock/hosting-contracts";
export type Connection = Pick<PoolClient, "query">;
export async function authorizeHosting(
  actor: HostingActor,
  target: {
    customerID?: string;
    projectID?: string;
    write?: boolean;
    operator?: boolean;
    live?: boolean;
    tenantAdmin?: boolean;
  },
  db: Connection,
) {
  const scopes = actor.scopes;
  const policy = actor.source === "git-policy";
  if (policy && (!target.projectID || target.operator || target.live || actor.sessionID !== ""))
    throw new HostingError(403, "Git publication policy is unavailable.");
  if (
    !scopes.includes("hosting:read") ||
    (target.write && !scopes.includes("hosting:write"))
  )
    throw new HostingError(403, "Hosting scope is required.");
  const row = (
    await db.query(
      policy ? `SELECT u.id,u.role,u.banned,u."emailVerified",u."mustChangePassword",u."twoFactorEnabled"
 FROM webdock_auth."user" u JOIN webdock_auth.git_source p ON p.policy_subject=u.id
 WHERE u.id=$1 AND p.project_id=$2 AND p.auto_publish AND p.enabled
 FOR SHARE OF u,p` : `SELECT u.id,u.role,u.banned,u."emailVerified",u."mustChangePassword",u."twoFactorEnabled"
 FROM webdock_auth."user" u JOIN webdock_auth.session s ON s."userId"=u.id
 WHERE u.id=$1 AND s.id=$2 AND s."expiresAt">now() FOR SHARE OF u,s`,
      [actor.subject, policy ? target.projectID : actor.sessionID],
    )
  ).rows[0];
  if (!row || row.banned || !row.emailVerified || row.mustChangePassword)
    throw new HostingError(401, "Sign in and complete account setup.");
  const operator = row.role === "operator" && row.twoFactorEnabled === true;
  if (!operator && row.role !== "user")
    throw new HostingError(403, "Complete operator security setup.");
  const preview = (
    await db.query(
      "SELECT customer_id,organization_id,expires_at,expired_at FROM webdock_auth.studio_tenant_preview WHERE session_id=$1 AND actor_id=$2",
      [actor.sessionID, actor.subject],
    )
  ).rows[0];
  if (
    preview &&
    (target.write ||
      target.operator ||
      target.live ||
      preview.expired_at ||
      new Date(preview.expires_at).getTime() <= Date.now())
  )
    throw new HostingError(403, "Customer preview is read-only.");
  if (target.operator && (!operator || preview))
    throw new HostingError(403, "Platform operator access is required.");
  let customerID = target.customerID
    ? resourceID.parse(target.customerID)
    : undefined;
  let project;
  if (target.projectID) {
    await db.query("SELECT webdock_admin.lock_hosting_project($1)",[resourceID.parse(target.projectID)]);
    project = (
      await db.query(
        "SELECT p.id,p.customer_id,p.status,h.mode,h.provider,h.cluster_id,h.revision,h.own_images FROM webdock_admin.projects p LEFT JOIN webdock_auth.hosting_project h ON h.project_id=p.id WHERE p.id=$1",
        [resourceID.parse(target.projectID)],
      )
    ).rows[0];
    if (
      !project ||
      project.status !== "active" ||
      (customerID && customerID !== project.customer_id)
    )
      throw new HostingError(404, "Hosting target is unavailable.");
    customerID = project.customer_id;
  }
  let membership;
  if (customerID) {
    const customer = (
      await db.query(
        `SELECT c.status,t.organization_id FROM webdock_admin.customers c JOIN webdock_auth.tenant_customer t ON t.customer_id=c.id WHERE c.id=$1 FOR SHARE OF c`,
        [customerID],
      )
    ).rows[0];
    if (
      !customer ||
      customer.status !== "active" ||
      (preview &&
        (preview.customer_id !== customerID ||
          preview.organization_id !== customer.organization_id))
    )
      throw new HostingError(404, "Hosting target is unavailable.");
    membership = (
      await db.query(
        'SELECT role FROM webdock_auth.member WHERE "organizationId"=$1 AND "userId"=$2 FOR SHARE',
        [customer.organization_id, actor.subject],
      )
    ).rows[0];
    if (!operator && !membership)
      throw new HostingError(404, "Hosting target is unavailable.");
    if (
      target.write &&
      !operator &&
      (!["admin", "owner"].includes(membership.role) ||
        (!target.tenantAdmin && project?.mode !== "selfservice"))
    )
      throw new HostingError(
        403,
        "This hosting action is managed by your operator.",
      );
  } else if (!operator || preview)
    throw new HostingError(403, "Choose an authorized hosting customer.");
  return {
    operator: operator && !preview,
    liveReads: !preview,
    customerID,
    project,
    canWrite:
      !preview && (operator || ["admin", "owner"].includes(membership?.role)),
  };
}
