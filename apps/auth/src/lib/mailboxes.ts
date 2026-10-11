import { z } from "zod";
import { MailServiceError } from "@webdock/mail-core";
import { resourceID } from "@webdock/hosting-contracts";
import type { Connection } from "./hosting/authorization";
import { authorizeMail, mailUnavailable, type MailActor } from "./mail-access";
import { normalizeMailDomain } from "./tenant-mail";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }).strict(),
  z.object({ action: z.literal("configuration.retry"), revision: z.string().regex(/^[1-9][0-9]{0,18}$/) }).strict(),
  z.object({ action: z.literal("domain.attach"), senderDomainID: resourceID }).strict(),
  z.object({ action: z.literal("mailbox.create"), domainID: resourceID, localPart: z.string().min(1).max(64).regex(/^[a-z0-9]+(?:[._+-][a-z0-9]+)*$/), name: z.string().trim().min(1).max(80).regex(/^[^\r\n\0]+$/), quotaBytes: z.coerce.number().int().min(1048576).max(8589934592) }).strict(),
  z.object({ action: z.literal("grant"), mailboxID: resourceID, subject: resourceID }).strict(),
  z.object({ action: z.literal("revoke"), mailboxID: resourceID, subject: resourceID }).strict(),
]);
function fail(message: string): never { throw new MailServiceError(message); }
export async function queueMailConfiguration(db: Connection, actor: MailActor, customerID: string, action: string, targetID: string) {
  const row = (await db.query(`INSERT INTO webdock_mail.configuration(customer_id) VALUES($1)
    ON CONFLICT(customer_id) DO UPDATE SET revision=configuration.revision+1 RETURNING revision`, [customerID])).rows[0];
  await db.query("UPDATE webdock_mail.configuration_operation SET state='superseded',finished_at=now() WHERE customer_id=$1 AND state='pending'", [customerID]);
  await db.query("INSERT INTO webdock_mail.configuration_operation(customer_id,revision,requested_by,reason) VALUES($1,$2,$3,$4)", [customerID, row.revision, actor.subject, action]);
  await db.query("INSERT INTO webdock_mail.access_event(customer_id,subject,action,target_id) VALUES($1,$2,$3,$4)", [customerID, actor.subject, action, targetID]);
}

export async function executeMailboxes(db: Connection, actor: MailActor, customerID: string, input: unknown): Promise<unknown> {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) fail("Invalid mailbox configuration.");
  const command = parsed.data, management = command.action !== "list";
  const access = await authorizeMail(db, actor, customerID, management, !["list", "revoke"].includes(command.action));
  if (management) await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["mail-configuration:" + customerID]);
  if (command.action === "list") {
    const mailboxes = (await db.query(`SELECT b.id,b.name,b.local_part||'@'||d.name AS address,b.state,b.enabled,b.quota_bytes AS "quotaBytes",
      coalesce($6 AND g.enabled AND g.revision=g.applied_revision AND b.enabled AND b.state='ready' AND i.state='ready' AND b.provider_id IS NOT NULL AND i.provider_id IS NOT NULL AND (g.member_id=$4 OR (g.operator_grant AND $5)),false) AS "canOpen"
      FROM webdock_mail.mailbox b JOIN webdock_mail.domain d ON d.id=b.domain_id AND d.customer_id=b.customer_id
      LEFT JOIN webdock_mail.mailbox_grant g ON g.mailbox_id=b.id AND g.customer_id=b.customer_id AND g.subject=$2
      LEFT JOIN webdock_mail.identity i ON i.customer_id=b.customer_id AND i.subject=$2
      WHERE b.customer_id=$1 AND ($3 OR g.enabled) ORDER BY b.name,b.id LIMIT 64`, [customerID, actor.subject, access.canManage, access.memberID, access.operator, Boolean(access.service?.ready)])).rows;
    const domains = (await db.query("SELECT id,name,state,dkim_keys AS \"dkimKeys\" FROM webdock_mail.domain WHERE customer_id=$1 ORDER BY name LIMIT 32", [customerID])).rows;
    const verifiedDomains = access.canManage ? (await db.query("SELECT id,domain FROM webdock_auth.mail_sender_domain WHERE customer_id=$1 AND status='ownership_verified' ORDER BY domain LIMIT 32", [customerID])).rows : [];
    const people = access.canManage ? (await db.query(`SELECT u.id,u.name,u.email FROM webdock_auth."user" u WHERE NOT coalesce(u.banned,false) AND u."emailVerified" AND NOT u."mustChangePassword" AND
      (($2 AND u.role='operator' AND u."twoFactorEnabled") OR EXISTS(SELECT 1 FROM webdock_auth.member m JOIN webdock_auth.tenant_customer t ON t.organization_id=m."organizationId" WHERE m."userId"=u.id AND t.customer_id=$1)) ORDER BY u.name LIMIT 128`, [customerID, access.operator])).rows : [];
    const grants = access.canManage ? (await db.query(`SELECT mailbox_id AS "mailboxID",subject,enabled,revision FROM webdock_mail.mailbox_grant WHERE customer_id=$1 ORDER BY mailbox_id,subject LIMIT 256`, [customerID])).rows : [];
    const configuration = (await db.query(`SELECT c.revision,c.applied_revision AS "appliedRevision",
      CASE WHEN EXISTS(SELECT 1 FROM webdock_mail.configuration_operation p WHERE p.customer_id=c.customer_id AND p.state='needs_review') THEN 'needs_review' ELSE o.state END AS state
      FROM webdock_mail.configuration c LEFT JOIN webdock_mail.configuration_operation o ON o.customer_id=c.customer_id AND o.revision=c.revision WHERE c.customer_id=$1`, [customerID])).rows[0] ?? null;
    return { customerID, operator: access.operator, configuration, canManage: access.canManage, canConfigure: access.canManage && Boolean(access.service?.ready), mailboxes, domains, verifiedDomains, people, grants };
  }
  if (command.action === "configuration.retry") {
    if (!access.operator) mailUnavailable();
    const configuration = (await db.query("SELECT revision FROM webdock_mail.configuration WHERE customer_id=$1 FOR UPDATE", [customerID])).rows[0];
    if (!configuration || String(configuration.revision) !== command.revision) fail("Mailbox configuration changed. Refresh before retrying.");
    if ((await db.query("SELECT id FROM webdock_mail.configuration_operation WHERE customer_id=$1 AND state='running'", [customerID])).rowCount) fail("Mailbox configuration is still running.");
    const reviewed = await db.query("UPDATE webdock_mail.configuration_operation SET state='superseded' WHERE customer_id=$1 AND state='needs_review'", [customerID]);
    if (!reviewed.rowCount) fail("No mailbox operation requires review.");
    await queueMailConfiguration(db, actor, customerID, command.action, customerID);
    return { ok: true };
  }
  if (command.action === "domain.attach") {
    const source = (await db.query("SELECT domain,status FROM webdock_auth.mail_sender_domain WHERE id=$1 AND customer_id=$2 FOR SHARE", [command.senderDomainID, customerID])).rows[0];
    if (!source || source.status !== "ownership_verified") fail("Verify domain ownership before enabling mailboxes.");
    const name = normalizeMailDomain(source.domain);
    const existing = (await db.query("SELECT id FROM webdock_mail.domain WHERE sender_domain_id=$1 AND customer_id=$2", [command.senderDomainID, customerID])).rows[0];
    if (existing) return { id: existing.id };
    if ((await db.query("SELECT count(*)::int AS count FROM webdock_mail.domain WHERE customer_id=$1", [customerID])).rows[0].count >= 32) fail("Mail domain configuration limit reached.");
    const row = (await db.query("INSERT INTO webdock_mail.domain(customer_id,sender_domain_id,name) VALUES($1,$2,$3) RETURNING id", [customerID, command.senderDomainID, name])).rows[0];
    await queueMailConfiguration(db, actor, customerID, command.action, row.id);
    return { id: row.id };
  }
  if (command.action === "mailbox.create") {
    const domain = (await db.query(`SELECT d.id FROM webdock_mail.domain d JOIN webdock_auth.mail_sender_domain s ON s.id=d.sender_domain_id AND s.customer_id=d.customer_id
      WHERE d.customer_id=$1 AND d.id=$2 AND s.status='ownership_verified' FOR SHARE OF d,s`, [customerID, command.domainID])).rows[0];
    if (!domain) mailUnavailable();
    const used = (await db.query("SELECT count(*)::int AS count,coalesce(sum(quota_bytes),0)::text AS bytes FROM webdock_mail.mailbox WHERE customer_id=$1", [customerID])).rows[0];
    // Keep 2 GiB of the fixed 10 GiB instance volume for identities and database overhead.
    if (used.count >= 64 || BigInt(used.bytes) + BigInt(command.quotaBytes) > 8589934592n) fail("Mail instance mailbox capacity is exhausted.");
    const existing = (await db.query("SELECT id FROM webdock_mail.mailbox WHERE domain_id=$1 AND local_part=$2", [command.domainID, command.localPart])).rows[0];
    if (existing) fail("This mailbox address already exists.");
    const row = (await db.query("INSERT INTO webdock_mail.mailbox(customer_id,domain_id,local_part,name,quota_bytes) VALUES($1,$2,$3,$4,$5) RETURNING id", [customerID, command.domainID, command.localPart, command.name, command.quotaBytes])).rows[0];
    await queueMailConfiguration(db, actor, customerID, command.action, row.id);
    return { id: row.id };
  }
  const mailbox = (await db.query("SELECT id FROM webdock_mail.mailbox WHERE customer_id=$1 AND id=$2 AND enabled FOR UPDATE", [customerID, command.mailboxID])).rows[0];
  if (!mailbox) mailUnavailable();
  const existing = (await db.query("SELECT enabled,member_id,operator_grant FROM webdock_mail.mailbox_grant WHERE customer_id=$1 AND mailbox_id=$2 AND subject=$3 FOR UPDATE", [customerID, mailbox.id, command.subject])).rows[0];
  if (command.action === "grant") {
    const user = (await db.query(`SELECT u.id,m.id AS member_id FROM webdock_auth."user" u LEFT JOIN webdock_auth.tenant_customer t ON t.customer_id=$2 LEFT JOIN webdock_auth.member m ON m."organizationId"=t.organization_id AND m."userId"=u.id WHERE u.id=$1 AND NOT coalesce(u.banned,false) AND u."emailVerified" AND NOT u."mustChangePassword" AND
      (($3 AND u.role='operator' AND u."twoFactorEnabled") OR EXISTS(SELECT 1 FROM webdock_auth.member m JOIN webdock_auth.tenant_customer t ON t.organization_id=m."organizationId" WHERE m."userId"=u.id AND t.customer_id=$2)) FOR SHARE OF u`, [command.subject, customerID, access.operator])).rows[0];
    if (!user) mailUnavailable();
    const operatorGrant = !user.member_id;
    if (existing?.enabled && existing.member_id === user.member_id && existing.operator_grant === operatorGrant) return { ok: true };
    if ((await db.query("SELECT count(*)::int AS count FROM webdock_mail.mailbox_grant WHERE customer_id=$1 AND enabled", [customerID])).rows[0].count >= 256) fail("Mail access configuration limit reached.");
    const identity = (await db.query("SELECT id FROM webdock_mail.identity WHERE customer_id=$1 AND subject=$2", [customerID, command.subject])).rows[0];
    if (!identity && (await db.query("SELECT count(*)::int AS count FROM webdock_mail.identity WHERE customer_id=$1", [customerID])).rows[0].count >= 128) fail("Mail identity configuration limit reached.");
    await db.query("INSERT INTO webdock_mail.identity(customer_id,subject) VALUES($1,$2) ON CONFLICT(customer_id,subject) DO NOTHING", [customerID, command.subject]);
    await db.query(`INSERT INTO webdock_mail.mailbox_grant(customer_id,mailbox_id,subject,member_id,operator_grant) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(mailbox_id,subject) DO UPDATE SET enabled=true,member_id=excluded.member_id,operator_grant=excluded.operator_grant,revision=mailbox_grant.revision+1`, [customerID, mailbox.id, command.subject, user.member_id, operatorGrant]);
  } else {
    if (!existing?.enabled) return { ok: true };
    await db.query("UPDATE webdock_mail.mailbox_grant SET enabled=false,revision=revision+1 WHERE customer_id=$1 AND mailbox_id=$2 AND subject=$3", [customerID, mailbox.id, command.subject]);
  }
  await queueMailConfiguration(db, actor, customerID, command.action, mailbox.id);
  return { ok: true };
}

export async function getTenantMailboxes(headers: Headers, customerID: string) {
  const { getTenant } = await import("./tenants");
  await getTenant(headers, customerID);
  if (process.env.WEBDOCK_NATIVE_MAILBOXES_ENABLED !== "true") return null;
  const { auth } = await import("./auth"), { transaction } = await import("./hosting/db");
  const session = await auth.api.getSession({ headers }); if (!session) mailUnavailable();
  return transaction(db => executeMailboxes(db, { subject: session.user.id, sessionID: session.session.id }, customerID, { action: "list" }));
}
export async function manageTenantMailboxes(headers: Headers, customerID: string, input: Record<string, string>) {
  if (process.env.WEBDOCK_NATIVE_MAILBOXES_ENABLED !== "true") mailUnavailable();
  const { auth } = await import("./auth"), { transaction } = await import("./hosting/db");
  const session = await auth.api.getSession({ headers }); if (!session) mailUnavailable();
  await transaction(db => executeMailboxes(db, { subject: session.user.id, sessionID: session.session.id }, customerID, input));
  return { message: "Mailbox change queued. Access is enabled only after server verification." };
}
