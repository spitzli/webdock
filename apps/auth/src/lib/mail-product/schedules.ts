import type {MailActor} from '@webdock/mail-contracts';
import {parseID} from '@webdock/mail-contracts/validation';
import {database} from '../db';import {withMailTransaction} from './store';import {assertMailAccess,MailError,mailUnavailable} from './access';
import {recordMailEvent} from './events';import {dispatchMail} from './sending';
function validTime(raw:string){
 if(typeof raw!=='string'||! /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(raw))throw new MailError(422,'invalid_schedule','Use an ISO time with timezone');
 const at=new Date(raw);if(!Number.isFinite(at.getTime())||at.getTime()<=Date.now()||at.getTime()>Date.now()+30*86400_000)throw new MailError(422,'invalid_schedule','Schedule must be within the next 30 days');return at;
}
export async function rescheduleMail(actor:MailActor,id:string,scheduledAt:string,revision:number):Promise<void>{
 parseID(id);const at=validTime(scheduledAt);
 if(!Number.isSafeInteger(revision)||revision<1)throw new MailError(422,'invalid_revision','Invalid revision');
 await withMailTransaction(async db=>{
  await assertMailAccess(actor,actor.principal.kind==='api_key'?'read':'send',db,false);
  if(!(await db.query('SELECT id FROM webdock_auth.mail_message WHERE id=$1 AND customer_id=$2 AND connection_id=$3',[id,actor.customerID,actor.connectionID])).rowCount)mailUnavailable();
  if(!(await db.query("UPDATE webdock_auth.mail_message SET scheduled_at=$4,revision=revision+1,updated_at=now() WHERE id=$1 AND customer_id=$2 AND connection_id=$3 AND dispatch_status='scheduled' AND revision=$5 AND scheduled_at IS NOT NULL RETURNING id",[id,actor.customerID,actor.connectionID,at,revision])).rowCount)throw new MailError(409,'schedule_conflict','Schedule was changed or claimed');
 });
}
export async function cancelScheduledMail(actor:MailActor,id:string,revision:number):Promise<void>{
 parseID(id);if(!Number.isSafeInteger(revision)||revision<1)throw new MailError(422,'invalid_revision','Invalid revision');
 await withMailTransaction(async db=>{
  await assertMailAccess(actor,actor.principal.kind==='api_key'?'read':'send',db,false);
  if(!(await db.query('SELECT id FROM webdock_auth.mail_message WHERE id=$1 AND customer_id=$2 AND connection_id=$3',[id,actor.customerID,actor.connectionID])).rowCount)mailUnavailable();
  if(!(await db.query("UPDATE webdock_auth.mail_message SET dispatch_status='canceled',revision=revision+1,terminal_at=now(),updated_at=now() WHERE id=$1 AND customer_id=$2 AND connection_id=$3 AND dispatch_status='scheduled' AND revision=$4 AND scheduled_at IS NOT NULL RETURNING id",[id,actor.customerID,actor.connectionID,revision])).rowCount)throw new MailError(409,'schedule_conflict','Schedule was changed or claimed');
  await db.query("UPDATE webdock_auth.mail_message_content SET encrypted_attachments=NULL,expires_at=now()+interval '30 days' WHERE message_id=$1",[id]);
  await recordMailEvent({...actor,resourceID:id,type:'email.canceled',occurredAt:new Date().toISOString(),source:'application',dedupeKey:'canceled:'+id},db);
 });
}
export async function dispatchDueMail(input:{limit:number;deadline:Date}):Promise<{processed:number}>{
 if(!Number.isInteger(input.limit)||input.limit<1||input.limit>100)throw new MailError(422,'invalid_limit','Invalid dispatch batch size');
 const rows=(await database.query(`SELECT m.id FROM webdock_auth.mail_message m JOIN webdock_auth.mail_connection c ON c.id=m.connection_id
 JOIN webdock_admin.customers t ON t.id=m.customer_id JOIN webdock_auth.platform_settings p ON p.id=true
 WHERE m.dispatch_status='scheduled' AND m.scheduled_at<=now() AND c.state='ready' AND c.deleted_at IS NULL AND t.status='active'
 AND p.settings->>'mailGatewayEnabled'='true' AND (c.kind='byok' OR p.settings->>'mailEnabled'='true') ORDER BY m.scheduled_at,m.id LIMIT $1`,[input.limit])).rows;
 let processed=0;
 // Each dispatch performs its own conditional durable claim before any side effect.
 for(let i=0;i<rows.length&&Date.now()<input.deadline.getTime();i+=4){
  await Promise.all(rows.slice(i,i+4).map(async row=>{const outcome=await dispatchMail(row.id,input.deadline);if(outcome.kind!=='rejected'||outcome.code!=='not_dispatchable')processed++;}));
 }
 return {processed};
}
