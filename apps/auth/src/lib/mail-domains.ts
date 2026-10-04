import { randomUUID } from "node:crypto";
import { auth } from "./auth";
import { database } from "./db";
import { getTenant } from "./tenants";
import { getPlatformSettings, mailProvider } from "./platform";
import { normalizeMailDomain } from "./tenant-mail";
import { type TurboSMTPClient } from "./turbosmtp";
import { senderDomain, TurboDomainsClient, type SenderDomain } from "./turbo-domains";
import { lookupMailTxt, planMailRecords, type DnsRecord } from "./mail-dns";

export class MailDomainsError extends Error {}
export const senderDomainSchemaSQL = `ALTER TABLE webdock_auth.mail_sender_domain
 ADD COLUMN IF NOT EXISTS provider_id text,
 ADD COLUMN IF NOT EXISTS provider_snapshot jsonb NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS provider_checked_at timestamptz,
 ADD COLUMN IF NOT EXISTS provider_operation text,
 ADD COLUMN IF NOT EXISTS provider_operation_started_at timestamptz;`;
type Dependencies = {
 provider?: () => Promise<Pick<TurboSMTPClient, "getSubaccount" | "authorizeSubaccount">>;
 childProvider?: (token: string) => Pick<TurboDomainsClient, "listSenderDomains" | "registerSenderDomain" | "deleteSenderDomain">;
 dnsFetch?: typeof fetch;
};
export type TenantSenderDomain = { id: string; domain: string; status: "pending" | "ownership_verified"; token: string; checkedAt?: string; providerStatus: "not_registered" | "pending" | "verified"; providerID?: string; providerCheckedAt?: string; spfVerified?: boolean; dkimVerified?: boolean; dmarcVerified?: boolean; records: DnsRecord[]; dnsIssue?: string; busy: boolean };
const fail = (message: string): never => { throw new MailDomainsError(message); };
const date = (value: string | Date | null) => value ? new Date(value).toISOString() : undefined;
async function accessToDomains(headers: Headers, customerID: string) {
 const access = await getTenant(headers, customerID);
 if (!access.canManage || access.tenant.status !== "active") fail("Active tenant administrator access is required.");
 if (!(await getPlatformSettings()).mailEnabled) fail("Mail is disabled by the platform operator.");
 return access;
}
export async function getTenantSenderDomains(headers: Headers, customerID: string, dependencies: Dependencies = {}): Promise<{ domains: TenantSenderDomain[] }> {
 await getTenant(headers, customerID);
 const rows = (await database.query("SELECT id,domain,status,token,checked_at,provider_id,provider_snapshot,provider_checked_at,provider_operation,provider_operation_started_at FROM webdock_auth.mail_sender_domain WHERE customer_id=$1 ORDER BY domain", [customerID])).rows;
 const domains: TenantSenderDomain[] = [];
 for (const row of rows) {
  let provider: SenderDomain | undefined;
  try { const parsed = senderDomain(row.provider_snapshot); if (parsed.id === row.provider_id && parsed.domain === row.domain) provider = parsed; } catch { /* No valid provider observation yet. */ }
  let dnsIssue: string | undefined;
  let txt = { root: [] as string[], dkim: [] as string[], dmarc: [] as string[], ownership: [] as string[] };
  try { txt = await lookupMailTxt(row.domain, dependencies.dnsFetch); } catch { dnsIssue = "Public DNS could not be checked. Preserve existing SPF and DMARC records; inspect them before applying changes."; }
  domains.push({ busy: Boolean(row.provider_operation && new Date(row.provider_operation_started_at).getTime() > Date.now() - 300_000), ...(typeof row.provider_id === "string" ? { providerID: row.provider_id } : {}), id: row.id, domain: row.domain, status: row.status, token: row.token, checkedAt: date(row.checked_at), providerStatus: provider?.spf_verified && provider.dkim_verified && provider.dmarc_verified ? "verified" : row.provider_id || row.provider_checked_at ? "pending" : "not_registered", ...(provider ? { providerID: provider.id, spfVerified: provider.spf_verified, dkimVerified: provider.dkim_verified, dmarcVerified: provider.dmarc_verified } : {}), providerCheckedAt: date(row.provider_checked_at), records: planMailRecords(row.domain, row.token, txt).filter(record => !dnsIssue || record.record === "OWNERSHIP"), ...(dnsIssue ? { dnsIssue } : {}) });
 }
 await getTenant(headers, customerID);
 return { domains };
}
export async function manageTenantSenderDomain(headers: Headers, customerID: string, input: { action: "register" | "refresh" | "unregister"; domainID: string; confirm?: string }, dependencies: Dependencies = {}): Promise<{ message: string }> {
 await accessToDomains(headers, customerID);
 if (!["register", "refresh", "unregister"].includes(input.action) || typeof input.domainID !== "string") fail("Unknown sender-domain action.");
 if (input.action === "unregister" && input.confirm !== "yes") fail("Confirm removal of this provider sender domain.");
 const session = await auth.api.getSession({ headers }); if (!session) fail("Sign in first.");
 const event = (await database.query("INSERT INTO webdock_auth.access_event(actor_id,action,target_id,outcome) VALUES($1,$2,$3,'started') RETURNING id", [session!.user.id, `mail-domain-${input.action}`, customerID])).rows[0].id;
 const operation = randomUUID();
 let reserved = false;
 let domainID: string | undefined;
 try {
  const stored = (await database.query("SELECT provider_id,email,state FROM webdock_auth.mail_tenant_account WHERE customer_id=$1", [customerID])).rows[0];
  const local = (await database.query("SELECT id,domain,status,provider_id FROM webdock_auth.mail_sender_domain WHERE customer_id=$1 AND id=$2", [customerID, input.domainID])).rows[0];
  if (!local) fail("Domain not found in this tenant.");
  if (input.action !== "unregister" && local.status !== "ownership_verified") fail("Verify domain ownership before configuring sending.");
  if (normalizeMailDomain(local.domain) !== local.domain) fail("Stored domain is invalid.");
  if (!stored?.provider_id || stored.state !== "ready") fail("A ready sending account is required.");
  const conflict = await database.query("SELECT id FROM webdock_auth.mail_sender_domain WHERE domain=$1 AND status='ownership_verified' AND customer_id<>$2", [local.domain, customerID]);
  if (input.action !== "unregister" && conflict.rowCount) fail("Domain is already verified by another tenant.");
  const reservation = await database.connect();
  try {
   await reservation.query("BEGIN");
   const locked = (await reservation.query("SELECT id FROM webdock_auth.mail_sender_domain WHERE customer_id=$1 AND id=$2 FOR UPDATE", [customerID, local.id])).rows[0];
   if (!locked) fail("Domain not found in this tenant.");
   if (input.action === "unregister" && (await reservation.query("SELECT to_regclass('webdock_auth.mail_tracking_domain') AS table_name")).rows[0].table_name) {
    const tracking = await reservation.query("SELECT id FROM webdock_auth.mail_tracking_domain WHERE sender_domain_id=$1 LIMIT 1", [local.id]);
    if (tracking.rowCount) fail("Remove associated tracking domains before removing this sender domain.");
   }
   const leased = await reservation.query("UPDATE webdock_auth.mail_sender_domain SET provider_operation=$3,provider_operation_started_at=now() WHERE customer_id=$1 AND id=$2 AND (provider_operation IS NULL OR provider_operation_started_at < now()-interval '5 minutes') RETURNING id", [customerID, local.id, operation]);
   if (!leased.rowCount) fail("A sender-domain operation is already running. Refresh shortly.");
   await reservation.query("COMMIT");
   reserved = true;
  } catch (error) { await reservation.query("ROLLBACK"); throw error; }
  finally { reservation.release(); }
  const recheck = async () => {
   await accessToDomains(headers, customerID);
   const current = (await database.query("SELECT d.status,d.provider_operation,a.provider_id,a.email,a.state FROM webdock_auth.mail_sender_domain d JOIN webdock_auth.mail_tenant_account a USING(customer_id) WHERE d.customer_id=$1 AND d.id=$2", [customerID,local.id])).rows[0];
   if (!current || current.provider_operation !== operation || current.provider_id !== stored.provider_id || current.email !== stored.email || current.state !== "ready" || input.action !== "unregister" && current.status !== "ownership_verified") fail("Sender-domain ownership or account mapping changed. Refresh before retrying.");
  };
  const master = await (dependencies.provider || mailProvider)();
  const account = await master.getSubaccount(stored.provider_id);
  if (account.id !== stored.provider_id || account.email?.toLowerCase() !== stored.email.toLowerCase()) fail("The sending account could not be verified.");
  if (!account.active) fail("Sending is paused.");
  const token = await master.authorizeSubaccount(stored.email);
  const child = dependencies.childProvider ? dependencies.childProvider(token) : new TurboDomainsClient({ apiKey: token });
  await recheck();
  let verified = false;
  if (input.action === "unregister") {
   if (!local.provider_id) fail("No mapped provider sender domain exists.");
   const before = (await child.listSenderDomains()).map(senderDomain);
   const matching = before.filter(domain => domain.domain === local.domain || domain.id === local.provider_id);
   if (matching.length !== 1 || matching[0].id !== local.provider_id || matching[0].domain !== local.domain) fail("The exact mapped provider sender domain could not be confirmed.");
   await recheck();
   domainID = local.id;
   await child.deleteSenderDomain(local.provider_id);
   const after = (await child.listSenderDomains()).map(senderDomain);
   if (after.some(domain => domain.id === local.provider_id || domain.domain === local.domain)) fail("The provider has not confirmed sender-domain removal. Refresh before retrying.");
   await recheck();
   const saved = await database.query("UPDATE webdock_auth.mail_sender_domain SET provider_id=NULL,provider_snapshot='{}',provider_checked_at=NULL WHERE customer_id=$1 AND id=$2 AND provider_operation=$3", [customerID, local.id, operation]);
   if (!saved.rowCount) fail("The domain operation expired. Refresh before retrying.");
  } else {
   // Both actions explicitly re-submit the owned domain: the provider only rechecks DNS on POST.
   domainID = local.id;
   await child.registerSenderDomain(local.domain);
   const matches = (await child.listSenderDomains()).map(senderDomain).filter(domain => domain.domain === local.domain);
   if (matches.length !== 1) fail("The provider did not confirm this exact sender domain. Refresh before retrying.");
   const result = matches[0];
   await recheck();
   const saved = await database.query("UPDATE webdock_auth.mail_sender_domain SET provider_id=$3,provider_snapshot=$4,provider_checked_at=now() WHERE customer_id=$1 AND id=$2 AND provider_operation=$5", [customerID, local.id, result.id, JSON.stringify(result), operation]);
   if (!saved.rowCount) fail("The domain operation expired. Refresh before retrying.");
   verified = result.spf_verified && result.dkim_verified && result.dmarc_verified;
  }
  await database.query("UPDATE webdock_auth.access_event SET outcome='succeeded' WHERE id=$1", [event]);
  return { message: input.action === "unregister" ? "Provider sender domain removed. Local ownership proof is retained." : verified ? "The provider verified SPF, DKIM and DMARC." : "Sender domain registered. Provider DNS verification is still pending." };
 } catch (error) {
  // A failed write/read must never keep a previous green status or imply rollback at the provider.
  if (domainID) await database.query("UPDATE webdock_auth.mail_sender_domain SET provider_snapshot='{}',provider_checked_at=now() WHERE customer_id=$1 AND id=$2 AND provider_operation=$3", [customerID, domainID, operation]);
  await database.query("UPDATE webdock_auth.access_event SET outcome='failed' WHERE id=$1", [event]);
  if (error instanceof MailDomainsError) throw error;
  return fail("Sender-domain operation could not be confirmed using the tenant account. The provider may have applied it; refresh before retrying.");
 } finally {
  if (reserved) await database.query("UPDATE webdock_auth.mail_sender_domain SET provider_operation=NULL,provider_operation_started_at=NULL WHERE customer_id=$1 AND id=$2 AND provider_operation=$3", [customerID,input.domainID,operation]);
 }
}
