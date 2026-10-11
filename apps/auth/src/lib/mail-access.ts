import { MailServiceError } from "@webdock/mail-core";
import type { Connection } from "./hosting/authorization";
export type MailActor = { subject: string; sessionID: string };
export function mailUnavailable(): never { throw new MailServiceError("Mail access is unavailable."); }
type User={id:string;role:string;banned:boolean|null;emailVerified:boolean;mustChangePassword:boolean;twoFactorEnabled:boolean};
function validUser(user:User|undefined){if(!user || user.banned || !user.emailVerified || user.mustChangePassword || !['operator','user'].includes(user.role) || user.role==='operator' && !user.twoFactorEnabled)mailUnavailable();return user;}
async function subjectAccess(db:Connection,user:User,customerID:string,manage:boolean,requireReady:boolean){
 if(!/^[1-9][0-9]{0,18}$/.test(customerID))mailUnavailable();
 const tenant=(await db.query(`SELECT c.status,t.organization_id FROM webdock_admin.customers c JOIN webdock_auth.tenant_customer t ON t.customer_id=c.id WHERE c.id=$1 FOR SHARE OF c`,[customerID])).rows[0];
 const operator=user.role==='operator';if(!tenant || tenant.status!=='active')mailUnavailable();
 const member=(await db.query('SELECT id,role FROM webdock_auth.member WHERE "organizationId"=$1 AND "userId"=$2 FOR SHARE',[tenant.organization_id,user.id])).rows[0];
 if(!operator && !member)mailUnavailable();
 const canManage=operator || ['owner','admin'].includes(member?.role);if(manage && !canManage)mailUnavailable();
 const service=(await db.query(`SELECT s.*,s.desired_enabled AND s.state='ready' AND s.revision=s.applied_revision AND EXISTS(SELECT 1 FROM webdock_auth.platform_settings WHERE id=true AND settings->>'mailEnabled'='true') AS ready FROM webdock_mail.service s WHERE customer_id=$1 FOR SHARE`,[customerID])).rows[0];
 if(requireReady && !service?.ready)mailUnavailable();
 return {operator,canManage,service,memberID:(member?.id??null) as string|null};
}
/** Browser management and content always require a live authenticated session. */
export async function authorizeMail(db: Connection, actor: MailActor, customerID: string, manage = false, requireReady = true) {
 if(!actor.sessionID)mailUnavailable();
 const user=validUser((await db.query(`SELECT u.id,u.role,u.banned,u."emailVerified",u."mustChangePassword",u."twoFactorEnabled" FROM webdock_auth."user" u JOIN webdock_auth.session s ON s."userId"=u.id WHERE u.id=$1 AND s.id=$2 AND s."expiresAt">now() FOR SHARE OF u,s`,[actor.subject,actor.sessionID])).rows[0]);
 if((await db.query('SELECT session_id FROM webdock_auth.studio_tenant_preview WHERE session_id=$1 AND actor_id=$2',[actor.sessionID,actor.subject])).rowCount)mailUnavailable();
 return subjectAccess(db,user,customerID,manage,requireReady);
}
async function mailboxAccess(db:Connection,access:Awaited<ReturnType<typeof subjectAccess>>,subject:string,customerID:string,mailboxID:string){
 // An operator's role never substitutes for an explicit mailbox grant.
 const row=(await db.query(`SELECT b.id,b.name,b.provider_id AS "accountID",d.name AS domain,b.local_part AS "localPart",i.id AS "identityID",i.provider_id AS "principalID",g.revision AS "grantRevision"
 FROM webdock_mail.mailbox b JOIN webdock_mail.domain d ON d.id=b.domain_id AND d.customer_id=b.customer_id
 JOIN webdock_mail.mailbox_grant g ON g.mailbox_id=b.id AND g.customer_id=b.customer_id AND g.subject=$3
 JOIN webdock_mail.identity i ON i.customer_id=g.customer_id AND i.subject=g.subject
 WHERE b.id=$1 AND b.customer_id=$2 AND b.enabled AND g.enabled AND g.revision=g.applied_revision AND b.state='ready' AND i.state='ready' AND b.provider_id IS NOT NULL AND i.provider_id IS NOT NULL AND (g.member_id=$4 OR (g.operator_grant AND $5)) FOR SHARE OF b,g,i`,[mailboxID,customerID,subject,access.memberID,access.operator])).rows[0];
 if(!row)mailUnavailable();return row as {id:string;name:string;accountID:string;domain:string;localPart:string;identityID:string;principalID:string;grantRevision:string};
}
export async function authorizeMailbox(db:Connection,actor:MailActor,customerID:string,mailboxID:string){return mailboxAccess(db,await authorizeMail(db,actor,customerID),actor.subject,customerID,mailboxID);}
/** Only an admitted job may use this: logout does not retract committed intent, but revoked grants/bans do. */
export async function authorizeQueuedMailbox(db:Connection,context:{subject:string;customerID:string;mailboxID:string;grantRevision:string}){
 const user=validUser((await db.query('SELECT id,role,banned,"emailVerified","mustChangePassword","twoFactorEnabled" FROM webdock_auth."user" WHERE id=$1 FOR SHARE',[context.subject])).rows[0]);
 const mailbox=await mailboxAccess(db,await subjectAccess(db,user,context.customerID,false,true),context.subject,context.customerID,context.mailboxID);
 if(String(mailbox.grantRevision)!==context.grantRevision)mailUnavailable();return mailbox;
}
