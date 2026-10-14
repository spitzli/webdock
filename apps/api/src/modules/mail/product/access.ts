import { withAuthenticatedDatabase } from "../../../db/database-context";
import type {
  MailActor,
  MailCapability,
  Permission,
} from "@webdock/mail-contracts";
import type { PoolClient } from "pg";
import { parseID } from "@webdock/mail-contracts/validation";
import { auth } from "../../auth/auth";
import { mailDatabase as database } from "./store";
export class MailError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = code;
  }
}
export function mailUnavailable(): never {
  throw new MailError(404, "not_found", "Mail resource unavailable");
}
export async function assertMailAccess(
  actor: MailActor,
  capability: MailCapability,
  db: Pick<PoolClient, "query"> = database,
  admission = true,
): Promise<void> {
  parseID(actor.customerID);
  parseID(actor.connectionID);
  const connection = (
    await db.query(
      `SELECT m.*,c.status AS customer_status,p.settings FROM webdock_auth.mail_connection m
 JOIN webdock_admin.customers c ON c.id=m.customer_id LEFT JOIN webdock_auth.platform_settings p ON p.id=true
 WHERE m.id=$1 AND m.customer_id=$2`,
      [actor.connectionID, actor.customerID],
    )
  ).rows[0];
  if (!connection || connection.customer_status !== "active") mailUnavailable();
  const principal = actor.principal;
  if (principal.kind === "session") {
    const user = (
      await db.query(
        `SELECT u.role,u."twoFactorEnabled",m.role AS membership,
  EXISTS(SELECT 1 FROM webdock_auth.studio_tenant_preview p WHERE p.session_id=s.id) AS preview
  FROM webdock_auth.session s JOIN webdock_auth."user" u ON u.id=s."userId"
  JOIN webdock_auth.tenant_customer t ON t.customer_id=$3
  LEFT JOIN webdock_auth.member m ON m."organizationId"=t.organization_id AND m."userId"=u.id
  WHERE s.id=$1 AND u.id=$2 AND s."expiresAt">now() AND NOT coalesce(u.banned,false)
  AND u."emailVerified" AND NOT u."mustChangePassword"`,
        [principal.sessionID, principal.userID, actor.customerID],
      )
    ).rows[0];
    if (!user || user.preview) mailUnavailable();
    if (user.role === "operator" && user.twoFactorEnabled) {
      await db.query(
        "INSERT INTO webdock_auth.access_event(actor_id,action,target_id,outcome) VALUES($1,$2,$3,'succeeded')",
        [principal.userID, "mail-product-" + capability, actor.customerID],
      );
    } else {
      if (
        user.role !== "user" ||
        !["member", "admin", "owner"].includes(user.membership)
      )
        mailUnavailable();
      if (
        capability === "operate" ||
        (capability === "manage" &&
          !["admin", "owner"].includes(user.membership))
      )
        mailUnavailable();
    }
  } else if (principal.kind === "api_key") {
    const key = (
      await db.query(
        "SELECT permission FROM webdock_auth.mail_api_key WHERE id=$1 AND customer_id=$2 AND connection_id=$3 AND revoked_at IS NULL",
        [principal.keyID, actor.customerID, actor.connectionID],
      )
    ).rows[0];
    if (
      !key ||
      capability === "operate" ||
      (capability !== "send" && key.permission !== "full_access")
    )
      mailUnavailable();
  } else if (principal.kind === "job") {
    // Jobs are bound to a live, fenced claim, not a client-supplied actor flag.
    const claim = (
      await db.query(
        "SELECT 1 FROM webdock_auth.mail_message WHERE id=$1 AND customer_id=$2 AND connection_id=$3 AND dispatch_status='dispatching' AND lease_until>now()",
        [principal.jobID, actor.customerID, actor.connectionID],
      )
    ).rowCount;
    if (!claim || capability !== "send") mailUnavailable();
  } else mailUnavailable();
  if (capability !== "read" && admission) {
    if (connection.settings?.mailGatewayEnabled !== true)
      throw new MailError(503, "gateway_disabled", "Mail gateway is disabled");
    if (connection.kind === "byok") {
      const { byokPolicy } = await import("../../hosting/byok");
      if (!(await byokPolicy(db, actor.customerID)).turbosmtp)
        mailUnavailable();
    }
    if (
      connection.kind === "platform" &&
      connection.settings?.mailEnabled !== true
    )
      throw new MailError(503, "mail_disabled", "Platform Mail is disabled");
    if (
      connection.deleted_at ||
      (capability === "send" && connection.state !== "ready")
    )
      throw new MailError(
        409,
        "connection_unavailable",
        "Sending connection is not ready",
      );
  }
}
export async function authorizeMailSession(
  headers: Headers,
  customerID: string,
  connectionID: string,
  capability: MailCapability,
): Promise<MailActor> {
  return withAuthenticatedDatabase(headers, async () => {
    const session = await auth.api.getSession({ headers });
    if (!session) mailUnavailable();
    const actor: MailActor = {
      customerID,
      connectionID,
      principal: {
        kind: "session",
        userID: session.user.id,
        sessionID: session.session.id,
      },
    };
    await assertMailAccess(actor, capability);
    return actor;
  });
}
export async function authorizeMailKey(
  request: Request,
  permission: Permission,
): Promise<MailActor> {
  const { authorizeMailKey: authorize } = await import("./api-keys");
  return authorize(request, permission);
}
