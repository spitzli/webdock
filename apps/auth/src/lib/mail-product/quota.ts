import type {MailActor} from '@webdock/mail-contracts';
import {parseID} from '@webdock/mail-contracts/validation';
import {database} from '../db';import {withMailTransaction} from './store';import {assertMailAccess,MailError,mailUnavailable} from './access';
export async function reserveMailQuota(actor:MailActor,messageID:string,recipientCount:number,at:Date):Promise<void>{
 parseID(messageID);
 if(!Number.isInteger(recipientCount)||recipientCount<1||recipientCount>50||!Number.isFinite(at.getTime()))throw new MailError(422,'validation_error','Invalid quota reservation');
 const period=at.toISOString().slice(0,7)+'-01';
 await withMailTransaction(async db=>{
  await assertMailAccess(actor,'send',db);
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['mail-product-quota:'+actor.customerID]);
  const message=(await db.query("SELECT id,simulated,dispatch_status FROM webdock_auth.mail_message WHERE id=$1 AND customer_id=$2 AND connection_id=$3 FOR UPDATE",[messageID,actor.customerID,actor.connectionID])).rows[0];
  if(!message)mailUnavailable();if(message.simulated)return;
  const existing=(await db.query('SELECT recipients,status FROM webdock_auth.mail_usage_reservation WHERE message_id=$1',[messageID])).rows[0];
  if(existing){if(existing.recipients!==recipientCount)mailUnavailable();return;}
  if(!['scheduled','dispatching'].includes(message.dispatch_status))mailUnavailable();
  const actual=Number((await db.query("SELECT count(*) FROM webdock_auth.mail_recipient WHERE message_id=$1 AND suppression_reason IS NULL",[messageID])).rows[0].count);
  if(actual!==recipientCount)mailUnavailable();
  const subscription=(await db.query('SELECT base,extras FROM webdock_auth.tenant_subscription WHERE customer_id=$1 FOR SHARE',[actor.customerID])).rows[0];
  const settings=(await db.query('SELECT settings FROM webdock_auth.platform_settings WHERE id=true')).rows[0]?.settings;
  const base=subscription?subscription.base.mailMessages:(settings?.mailDefaultLimit??1000),extra=subscription?.extras?.mailMessages??0;
  if((base!==null&&(!Number.isSafeInteger(base)||base<0))||!Number.isSafeInteger(extra)||extra<0)throw new MailError(503,'quota_unavailable','Mail quota configuration is unavailable');
  const budget=base===null?null:BigInt(base)+BigInt(extra);
  const usage=(await db.query('SELECT coalesce(sum(reserved+consumed),0)::text AS used FROM webdock_auth.mail_usage_period WHERE customer_id=$1 AND period=$2',[actor.customerID,period])).rows[0];
  if(budget!==null&&BigInt(usage.used)+BigInt(recipientCount)>budget)throw new MailError(429,'quota_exceeded','Monthly recipient allowance exhausted');
  await db.query('INSERT INTO webdock_auth.mail_usage_period(customer_id,connection_id,period,budget,reserved) VALUES($1,$2,$3,$4,$5) ON CONFLICT(customer_id,connection_id,period) DO UPDATE SET reserved=mail_usage_period.reserved+$5,budget=$4',[actor.customerID,actor.connectionID,period,budget?.toString()??null,recipientCount]);
  await db.query("INSERT INTO webdock_auth.mail_usage_reservation(customer_id,connection_id,message_id,period,recipients,status) VALUES($1,$2,$3,$4,$5,'reserved')",[actor.customerID,actor.connectionID,messageID,period,recipientCount]);
 });
}
/** Internal settlement; unknown provider acceptance never releases a reservation. */
export async function settleMailQuota(messageID:string,outcome:'accepted'|'rejected'|'unknown'):Promise<void>{
 parseID(messageID);if(outcome==='unknown')return;
 if(!['accepted','rejected'].includes(outcome))throw new MailError(422,'validation_error','Invalid quota outcome');
 const customer=(await database.query('SELECT customer_id FROM webdock_auth.mail_usage_reservation WHERE message_id=$1',[messageID])).rows[0];if(!customer)return;
 await withMailTransaction(async db=>{
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['mail-product-quota:'+customer.customer_id]);
  const row=(await db.query("UPDATE webdock_auth.mail_usage_reservation SET status=$2 WHERE message_id=$1 AND status='reserved' RETURNING *",[messageID,outcome==='accepted'?'consumed':'released'])).rows[0];
  if(!row)return;
  await db.query('UPDATE webdock_auth.mail_usage_period SET reserved=reserved-$4,consumed=consumed+$5 WHERE customer_id=$1 AND connection_id=$2 AND period=$3',[row.customer_id,row.connection_id,row.period,row.recipients,outcome==='accepted'?row.recipients:0]);
 });
}
