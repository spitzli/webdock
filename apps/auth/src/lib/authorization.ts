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
  // Only mapped, active customer administrators inherit website access.
  // An explicit revoked or mismatched site grant still fails closed.
  const access = (
    await database.query(
      `SELECT CASE WHEN c.status='active' AND m.role IN ('owner','admin') THEN 'admin' ELSE g.role END AS role
 FROM webdock_auth.member m
 LEFT JOIN webdock_auth.tenant_customer t ON t.organization_id=m."organizationId"
 LEFT JOIN webdock_admin.customers c ON c.id=t.customer_id
 LEFT JOIN webdock_auth.project_grant g ON g.user_id=m."userId" AND g.binding_id=$2
 WHERE m."userId"=$1 AND m."organizationId"=$3
 AND (t.customer_id IS NULL OR c.status='active')
 AND (g.id IS NULL OR (g.enabled=true AND g.organization_id=$3))
 AND ((c.status='active' AND m.role IN ('owner','admin')) OR g.enabled=true)`,
      [subject, binding, row.organization_id],
    )
  ).rows[0];
  return access
    ? {
        webdock_role: access.role,
        webdock_email: row.email,
        webdock_name: row.name,
      }
    : { disabled: true };
}
