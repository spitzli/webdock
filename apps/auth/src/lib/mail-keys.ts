import { isIP } from "node:net";
import { auth } from "./auth";
import { database } from "./db";
import { getTenant } from "./tenants";
import { getPlatformSettings, mailProvider } from "./platform";
import { TurboSMTPClient, type TurboSMTPPermission } from "./turbosmtp";

export class MailKeysError extends Error {}
type Dependencies = {
 provider?: () => Promise<Pick<TurboSMTPClient, "getSubaccount" | "authorizeSubaccount">>;
 childProvider?: (token: string) => Pick<TurboSMTPClient, "listConsumerKeys" | "createConsumerKey" | "deleteConsumerKey">;
};
export type MailKeyInput = { action: string; label?: string; permissions?: string[]; ips?: string[]; consumerKey?: string; confirm?: string };
function fail(message: string): never { throw new MailKeysError(message); }
async function accessToKeys(headers: Headers, customerID: string) {
 const access = await getTenant(headers, customerID);
 if (!access.canManage || access.tenant.status !== "active") fail("Active tenant administrator access is required.");
 return access;
}
async function childAccount(customerID: string, dependencies: Dependencies) {
 const stored = (await database.query("SELECT provider_id,email,state FROM webdock_auth.mail_tenant_account WHERE customer_id=$1", [customerID])).rows[0];
 if (!stored?.provider_id || stored.state !== "ready") fail("A ready sending account is required. Ask your operator to complete setup.");
 const master = await (dependencies.provider || mailProvider)();
 const account = await master.getSubaccount(stored.provider_id);
 if (account.id !== stored.provider_id || account.email?.toLowerCase() !== stored.email.toLowerCase()) fail("The sending account could not be verified. Contact your operator.");
 const token = await master.authorizeSubaccount(stored.email);
 return { active: account.active, token, client: dependencies.childProvider ? dependencies.childProvider(token) : new TurboSMTPClient({ apiKey: token }) };
}
export async function getTenantMailKeys(headers: Headers, customerID: string, dependencies: Dependencies = {}) {
 const access = await accessToKeys(headers, customerID);
 try {
  const settings = await getPlatformSettings();
  const child = await childAccount(customerID, dependencies);
  const listed = await child.client.listConsumerKeys();
  await accessToKeys(headers, customerID);
  return { tenant: { id: String(access.tenant.id), name: String(access.tenant.name) }, operator: access.operator, enabled: settings.mailEnabled, active: child.active, smtpHost: settings.mailRegion === "eu" ? "pro.eu.turbo-smtp.com" : "pro.turbo-smtp.com", sendAPI: settings.mailRegion === "eu" ? "https://api.eu.turbo-smtp.com/api/v2/mail/send" : "https://api.turbo-smtp.com/api/v2/mail/send", keys: listed.results.map(({ consumerKey, label, creation_time, ips, is_legacy, permissions }) => ({ consumerKey, label, creation_time, ips, is_legacy, permissions })) };
 } catch (error) { if (error instanceof MailKeysError) throw error; fail("Could not load credentials. Contact your operator if this persists."); }
}
export async function manageTenantMailKeys(headers: Headers, customerID: string, input: MailKeyInput, dependencies: Dependencies = {}): Promise<{ message: string; created?: { consumerKey: string; consumerSecret: string } }> {
 const access = await accessToKeys(headers, customerID);
 if (!["create", "revoke"].includes(input.action)) fail("Unknown credential action.");
 const label = input.label?.trim() || "";
 const permissions = input.permissions || [], ips = input.ips || [];
 if (input.action === "create") {
  if (!label || label.length > 100 || /[\x00-\x1f\x7f]/.test(label)) fail("Enter a readable label of up to 100 characters.");
  if (!permissions.length || permissions.length > 3 || permissions.some(p => !["SEND_SMTP", "SEND_API", ...(access.operator ? ["APIS"] : [])].includes(p))) fail("Choose the permitted sending access for this credential.");
  if (ips.length > 100 || ips.some(ip => !isIP(ip))) fail("Use individual IPv4 or IPv6 addresses, without CIDR ranges.");
  if (!(await getPlatformSettings()).mailEnabled) fail("Mail is disabled. Existing credentials can still be listed and revoked.");
 } else if (input.confirm !== "yes" || !input.consumerKey || input.consumerKey.length > 255 || !/^[\x21-\x7e]+$/.test(input.consumerKey)) fail("Confirm revocation of this credential.");
 const session = await auth.api.getSession({ headers });
 if (!session) fail("Sign in first.");
 const event = (await database.query("INSERT INTO webdock_auth.access_event(actor_id,action,target_id,outcome) VALUES($1,$2,$3,'started') RETURNING id", [session!.user.id, `mail-key-${input.action}`, customerID])).rows[0].id;
 try {
  const child = await childAccount(customerID, dependencies);
  if (input.action === "revoke") {
   const listed = await child.client.listConsumerKeys();
   if (!listed.results.some(key => key.consumerKey === input.consumerKey)) fail("Credential not found in this tenant account.");
  } else if (!child.active) fail("Sending is paused. Existing credentials can still be listed and revoked.");
  const current = await accessToKeys(headers, customerID);
  if (input.action === "create" && permissions.includes("APIS") && !current.operator) fail("Platform operator access is required.");
  if (input.action === "create" && !(await getPlatformSettings()).mailEnabled) fail("Mail is disabled.");
  const created = input.action === "create" ? await child.client.createConsumerKey(child.token, label, { permissions: permissions as TurboSMTPPermission[], ips }) : undefined;
  if (input.action === "revoke") await child.client.deleteConsumerKey(input.consumerKey!);
  await database.query("UPDATE webdock_auth.access_event SET outcome='succeeded' WHERE id=$1", [event]);
  // Never persist the credential pair, authorization token, or provider response in the audit log.
  return { message: created ? "Credential created. Save the secret now; it cannot be retrieved again." : "Credential revoked. Applications using it have lost access.", ...(created ? { created } : {}) };
 } catch (error) {
  await database.query("UPDATE webdock_auth.access_event SET outcome='failed' WHERE id=$1", [event]);
  if (error instanceof MailKeysError) throw error;
  fail("Could not complete this credential change. Refresh the list before retrying; a creation may have completed.");
 }
}
