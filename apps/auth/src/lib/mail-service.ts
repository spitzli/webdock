import { getMailService, requestMailService, MailServiceError } from "@webdock/mail-core";
import { database } from "./db";
import { getTenant } from "./tenants";
import { requireAccessOperator } from "./access-management";
import { getPlatformSettings } from "./platform";
export { MailServiceError };

export async function getTenantMailService(headers: Headers, customerID: string) {
  const access = await getTenant(headers, customerID);
  if (process.env.WEBDOCK_NATIVE_MAIL_ENABLED !== "true") return null;
  const [service, settings] = await Promise.all([getMailService(database, customerID), getPlatformSettings()]);
  const verified = access.operator && service.state === "needs_review" && (await database.query("SELECT customer_id FROM webdock_mail.instance WHERE customer_id=$1 AND verified_at IS NOT NULL", [customerID])).rowCount;
  return { service, canReconcile: Boolean(verified) && (!service.enabled || (access.tenant.status === "active" && settings.mailEnabled)), canActivate: access.operator && access.tenant.status === "active" && settings.mailEnabled,
    canSuspend: access.operator && service.enabled };
}

export async function manageTenantMailService(headers: Headers, customerID: string, input: Record<string, string>) {
  if (process.env.WEBDOCK_NATIVE_MAIL_ENABLED !== "true") throw new MailServiceError("Native Mail is not available yet.");
  const session = await requireAccessOperator(headers);
  await getTenant(headers, customerID);
  if (!["activate", "suspend", "reconcile"].includes(input.action)) throw new MailServiceError("Unknown Mail service action.");
  const hostID = process.env.MAIL_MANAGED_CLUSTER_ID || (process.env.AUTH_TEST_MAIL === "true" ? process.env.MAIL_DEFAULT_HOST_ID || "primary" : "");
  if (!hostID || (process.env.AUTH_TEST_MAIL !== "true" && !/^[1-9][0-9]{0,18}$/.test(hostID))) throw new MailServiceError("A managed Mail cluster must be configured.");
  const enabled = input.action === "reconcile" ? (await getMailService(database, customerID)).enabled : input.action === "activate";
  const result = await requestMailService(database, { customerID, enabled, reconcile: input.action === "reconcile",
    actorID: session.user.id, expectedRevision: input.revision, hostID });
  return { message: result.state === "needs_review" ? "Mail change recorded. An operator must reconcile the existing operation."
    : result.state === "pending" || result.state === "provisioning" ? "Mail change queued. Existing mailbox data will be retained."
    : "Mail settings are unchanged." };
}
