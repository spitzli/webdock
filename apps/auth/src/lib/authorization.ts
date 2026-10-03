import { database } from "./db";
export async function currentClaims(
  subject: string | undefined,
  binding: unknown,
) {
  if (!subject || typeof binding !== "string") return { disabled: true };
  const row = (
    await database.query(
      `SELECT u.id,u.email,u.name,u.role,u.banned,u."emailVerified",u."twoFactorEnabled",u."mustChangePassword",b.id AS binding_id,b.enabled,b.organization_id
 FROM webdock_auth."user" u CROSS JOIN webdock_auth.app_binding b WHERE u.id=$1 AND b.id=$2`,
      [subject, binding],
    )
  ).rows[0];
  if (
    !row ||
    row.banned ||
    !row.emailVerified ||
    row.mustChangePassword ||
    !row.enabled
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
  if (!row.organization_id) return { disabled: true };
  const grant = (
    await database.query(
      `SELECT g.role FROM webdock_auth.project_grant g JOIN webdock_auth.member m ON m."userId"=g.user_id AND m."organizationId"=g.organization_id WHERE g.user_id=$1 AND g.binding_id=$2 AND g.organization_id=$3 AND g.enabled=true`,
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
