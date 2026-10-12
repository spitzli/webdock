import type {MailActor} from '@webdock/mail-contracts';
import {parseAddress} from '@webdock/mail-contracts/validation';
import {mailDatabase as database} from './store';
import {assertMailAccess,MailError} from './access';
import {withMailTransaction} from './store';
export async function getSuppressedRecipients(customerID:string,emails:string[]):Promise<Set<string>>{
 const result=await database.query('SELECT email FROM webdock_auth.mail_suppression WHERE customer_id=$1 AND email=ANY($2)',[customerID,emails]);return new Set(result.rows.map(r=>r.email as string));
}
export async function setMailSuppression(actor:MailActor,input:{email:string;reason:string}):Promise<void>{
 const email=parseAddress(input.email);
 if(!['manual','bounced','complained','unsubscribed'].includes(input.reason))throw new MailError(422,'validation_error','Invalid suppression reason');
 await withMailTransaction(async db=>{
  await assertMailAccess(actor,'manage',db);
  await db.query("INSERT INTO webdock_auth.mail_suppression(customer_id,email,reason,source) VALUES($1,$2,$3,'application') ON CONFLICT(customer_id,email) DO UPDATE SET reason=excluded.reason,source=excluded.source WHERE mail_suppression.reason NOT IN ('complained','unsubscribed') OR excluded.reason IN ('complained','unsubscribed')",[actor.customerID,email,input.reason]);
 });
}
export async function removeMailSuppression(actor:MailActor,email:string):Promise<void>{
 const normalized=parseAddress(email);
 await withMailTransaction(async db=>{await assertMailAccess(actor,'manage',db);await db.query('DELETE FROM webdock_auth.mail_suppression WHERE customer_id=$1 AND email=$2',[actor.customerID,normalized]);});
}
export async function listMailSuppressions(actor:MailActor){await assertMailAccess(actor,'read');return (await database.query('SELECT email,reason,source,created_at FROM webdock_auth.mail_suppression WHERE customer_id=$1 ORDER BY email LIMIT 100',[actor.customerID])).rows;}
