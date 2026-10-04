import { database } from "./db";
import { getPlatformSettings } from "./platform";
export async function currentClaims(
  subject: string | undefined,
  binding: unknown,
) {
  if (!subject || typeof binding !== "string") return { disabled: true };
  const row = (
    await database.query(
      `SELECT u.id,u.email,u.name,u.role,u.banned,u."emailVerified",u."twoFactorEnabled",u."mustChangePassword",b.id AS binding_id,b.enabled,b.organization_id,b.client_id,c.disabled AS client_disabled
 FROM webdock_auth."user" u CROSS JOIN webdock_auth.app_binding b JOIN webdock_auth."oauthClient" c ON c."clientId"=b.client_id WHERE u.id=$1 AND b.id=$2`,
      [subject, binding],
    )
  ).rows[0];
  if (
    !row ||
    row.banned ||
    !row.emailVerified ||
    row.mustChangePassword ||
    !row.enabled ||
    row.client_disabled
  )
    return { disabled: true };
  if (row.role === "operator")
    return row.twoFactorEnabled
      ? {
          webdock_role: "operator",
          webdock_email: row.email,
          webdock_name: row.name,
        }
      : { disabled: true };
  // Studio is the global customer portal; website grants and CMS availability
  // remain independent from this membership-based reader identity.
  if (process.env.WEBDOCK_STUDIO_CLIENT_ID && row.client_id === process.env.WEBDOCK_STUDIO_CLIENT_ID && !row.organization_id) {
    const member = (await database.query(
      `SELECT 1 FROM webdock_auth.member m JOIN webdock_auth.tenant_customer t ON t.organization_id=m."organizationId" JOIN webdock_admin.customers c ON c.id=t.customer_id WHERE m."userId"=$1 AND c.status='active' LIMIT 1`,
      [subject],
    )).rowCount;
    return member && row.role === "user"
      ? { webdock_role: "reader", webdock_email: row.email, webdock_name: row.name }
      : { disabled: true };
  }
  if (!row.organization_id) return { disabled: true };
  if (!(await getPlatformSettings()).cmsEnabled) return { disabled: true };
  const grant = (
    await database.query(
      `SELECT g.role FROM webdock_auth.project_grant g JOIN webdock_auth.member m ON m."userId"=g.user_id AND m."organizationId"=g.organization_id WHERE g.user_id=$1 AND g.binding_id=$2 AND g.organization_id=$3 AND g.enabled=true AND NOT EXISTS (SELECT 1 FROM webdock_auth.tenant_customer t JOIN webdock_admin.customers c ON c.id=t.customer_id WHERE t.organization_id=g.organization_id AND c.status<>'active')`,
      [subject, binding, row.organization_id],
    )
  ).rows[0];
  return grant
    ? {
        webdock_role: grant.role,
        webdock_email: row.email,
        webdock_name: row.name,
      }
    : { disabled: true };
}
