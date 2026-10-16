import { consoleAuthConfiguration } from "../auth/console-configuration";
import { currentDatabaseScope } from "@webdock/database-runtime";
import { authDatabase } from "../../db/runtime";
import { clerkProvider, liveMemberships } from "../auth/clerk-provider";
import type { Connection } from "../hosting/authorization";

/** Undefined means unlinked legacy identity; null means a linked identity denied access. */
export async function clerkMailAccess(
  db: Connection,
  subject: string,
  customerID: string,
) {
  const identities =
    currentDatabaseScope()?.kind === "system" ? db : authDatabase;
  if (
    !(
      await identities.query(
        "SELECT to_regclass('webdock_auth.clerk_identity') IS NOT NULL AS present",
      )
    ).rows[0]?.present
  )
    return undefined;
  const link = (
    await identities.query(
      `SELECT i.*,u.role,u.banned FROM webdock_auth.clerk_identity i JOIN webdock_auth."user" u ON u.id=i.user_id WHERE i.user_id=$1`,
      [subject],
    )
  ).rows[0];
  if (!link) {
    const tenant = (
      await db.query(
        "SELECT organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$1",
        [customerID],
      )
    ).rows[0];
    const mapped =
      tenant &&
      (
        await identities.query(
          "SELECT 1 FROM webdock_auth.clerk_organization WHERE organization_id=$1",
          [tenant.organization_id],
        )
      ).rowCount;
    return mapped ? null : undefined;
  }
  if (!link.enabled || link.banned || !["user", "operator"].includes(link.role))
    return null;
  if (!consoleAuthConfiguration().issuer || link.issuer !== consoleAuthConfiguration().issuer)
    throw Error("Mail identity verification is not configured.");
  const user = await clerkProvider().users.getUser(link.clerk_user_id);
  if (
    user.banned ||
    user.locked ||
    !user.emailAddresses.some(
      (e) =>
        e.id === user.primaryEmailAddressId &&
        e.verification?.status === "verified",
    )
  )
    return null;
  const tenant = (
    await db.query(
      "SELECT organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$1",
      [customerID],
    )
  ).rows[0];
  if (!tenant) return null;
  const organization = (
    await identities.query(
      "SELECT * FROM webdock_auth.clerk_organization WHERE issuer=$1 AND organization_id=$2 AND enabled",
      [link.issuer, tenant.organization_id],
    )
  ).rows[0];
  const member = organization
    ? (await liveMemberships(link.clerk_user_id)).find(
        (m) =>
          m.organization.id === organization.clerk_organization_id &&
          ["org:admin", "org:member"].includes(m.role),
      )
    : undefined;
  if (!member && link.role !== "operator") return null;
  return {
    operator: link.role === "operator",
    canManage: link.role === "operator" || member?.role === "org:admin",
    // Membership IDs prevent a removed-and-reinvited member inheriting an old grant.
    clerkGrant: JSON.stringify([
      link.issuer,
      link.clerk_user_id,
      member ? organization.clerk_organization_id : null,
      member?.id ?? null,
    ]),
  };
}

/** Call only after management authorization. Live organization members and explicitly eligible operators only. */
export async function clerkMailPeople(
  db: Connection,
  customerID: string,
  operator = false,
) {
  if (
    !(
      await authDatabase.query(
        "SELECT to_regclass('webdock_auth.clerk_identity') IS NOT NULL AS present",
      )
    ).rows[0]?.present
  )
    return undefined;
  const tenant = (
    await db.query(
      "SELECT organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$1",
      [customerID],
    )
  ).rows[0];
  const organization =
    tenant &&
    (
      await authDatabase.query(
        "SELECT * FROM webdock_auth.clerk_organization WHERE organization_id=$1",
        [tenant.organization_id],
      )
    ).rows[0];
  if (!organization) return undefined;
  if (!organization.enabled) return [];
  if (
    !consoleAuthConfiguration().issuer ||
    organization.issuer !== consoleAuthConfiguration().issuer
  )
    throw Error("Mail identity verification is not configured.");
  const members = [];
  const provider = clerkProvider();
  for (let offset = 0; ; offset += 100) {
    const page = await provider.organizations.getOrganizationMembershipList({
      organizationId: organization.clerk_organization_id,
      limit: 100,
      offset,
    });
    members.push(
      ...page.data
        .filter((m) => ["org:admin", "org:member"].includes(m.role))
        .map((m) => m.publicUserData?.userId)
        .filter(Boolean),
    );
    if (offset + page.data.length >= page.totalCount) break;
    if (!page.data.length || offset >= 10000)
      throw Error("Mail membership verification is unavailable.");
  }
  return (
    await authDatabase.query(
      `SELECT u.id,u.name,u.email FROM webdock_auth.clerk_identity i JOIN webdock_auth."user" u ON u.id=i.user_id WHERE i.issuer=$1 AND (i.clerk_user_id=ANY($2::text[]) OR ($3 AND u.role='operator')) AND i.enabled AND NOT coalesce(u.banned,false) AND u.role IN ('user','operator') ORDER BY u.name LIMIT 128`,
      [organization.issuer, members, operator],
    )
  ).rows;
}
