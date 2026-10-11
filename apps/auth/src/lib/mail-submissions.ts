import {z} from 'zod';
import {openSecret} from '@webdock/mail-core/secrets';
import {enqueueMail,beginHandoff,finishHandoff,cancelSend,rejectPreparation,type SendLease} from '@webdock/mail-core/outbox';
import type {Connection} from './hosting/authorization';
import {authorizeMailKey,authorizeMailKeyID,nativeKeyToken,requireNativeSending} from './mail-native-keys';
import {mailUnavailable} from './mail-access';
import {reserveMailBudget,settleMailBudget} from './mail-budget';
import {byokPolicy} from './hosting/byok';
import {decryptMailSecret} from './platform';
const address=z.string().max(254).regex(/^[^\s<>@,;:\x00-\x1f]+@(?:[a-z0-9-]+\.)+[a-z0-9-]+$/);
export const sendEnvelope=z.object({from:address,to:z.array(address).min(1).max(100)}).strict();
export const admissionSchema=z.object({token:nativeKeyToken,idempotencyKey:z.string().regex(/^[\x21-\x7e]{1,200}$/),requestHash:z.string().regex(/^[a-f0-9]{64}$/),payloadRef:z.string().uuid(),payloadBytes:z.number().int().positive().max(26214400),envelope:sendEnvelope,notBefore:z.string().datetime().optional()}).strict();
const credentials=z.object({consumerKey:z.string().min(1).max(4096),consumerSecret:z.string().min(1).max(4096)}).strict();
async function transport(db:Connection,customerID:string,from:string){
 const domain=from.split('@')[1];
 const owned=(await db.query("SELECT * FROM webdock_auth.mail_sender_domain WHERE customer_id=$1 AND domain=$2 AND status='ownership_verified' AND provider_operation IS NULL FOR SHARE",[customerID,domain])).rows[0];
 if(!owned)mailUnavailable();
 const row=(await db.query("SELECT * FROM webdock_mail.send_transport WHERE customer_id=$1 AND state='ready' FOR SHARE",[customerID])).rows[0];
 if(!row)mailUnavailable();
 let secret:unknown,snapshot;
 if(row.mode==='byok'){
  if(!(await byokPolicy(db,customerID)).turbosmtp)mailUnavailable();
  const byok=(await db.query("SELECT * FROM webdock_auth.hosting_turbosmtp WHERE customer_id=$1 AND state='ready' AND pending_domain IS NULL FOR SHARE",[customerID])).rows[0];
  if(!byok?.encrypted_secret || byok.revision!==row.byok_revision || row.region!=='eu')mailUnavailable();
  secret=decryptMailSecret(byok.encrypted_secret,`byok-mail:${customerID}`);
  snapshot=Array.isArray(byok.snapshot)?byok.snapshot.find((entry:{domain?:string})=>entry.domain===domain):undefined;
 }else{
  const managed=(await db.query("SELECT * FROM webdock_auth.mail_tenant_account WHERE customer_id=$1 AND state='ready' FOR SHARE",[customerID])).rows[0];
  if(!managed || managed.provider_id!==row.provider_account_id || managed.snapshot?.active!==true || !row.encrypted_credentials)mailUnavailable();
  secret=openSecret(row.encrypted_credentials,`send-transport:${customerID}:${row.revision}`,process.env.MAIL_ENCRYPTION_KEY||'');
  snapshot=owned.provider_snapshot;
  if(snapshot?.id!==owned.provider_id)mailUnavailable();
 }
 if(snapshot?.domain!==domain || snapshot.spf_verified!==true || snapshot.dkim_verified!==true || snapshot.dmarc_verified!==true)mailUnavailable();
 return {binding:{transportRevision:String(row.revision),mode:row.mode as string},account:{region:row.region as 'eu'|'global',...credentials.parse(secret)}};
}
export async function preflightSubmission(db:Connection,token:string,envelope:unknown){
 const message=sendEnvelope.parse(envelope),access=await authorizeMailKey(db,token,message.from);
 await transport(db,access.customerID,message.from);return {customerID:access.customerID};
}
/** Metadata only. The trusted gateway has already durably stored and hashed the private payload. */
export async function admitSubmission(db:Connection,input:unknown){
 const command=admissionSchema.parse(input),access=await authorizeMailKey(db,command.token,command.envelope.from);
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['mail-admission:'+access.customerID]);
 const previous=(await db.query('SELECT id,request_hash,state FROM webdock_mail.send_job WHERE customer_id=$1 AND source_id=$2 AND idempotency_key=$3',[access.customerID,'key:'+access.keyID,command.idempotencyKey])).rows[0];
 if(previous){if(previous.request_hash!==command.requestHash)mailUnavailable();return {id:previous.id as string,state:previous.state as string,created:false};}
 const route=await transport(db,access.customerID,command.envelope.from);
 const id=(await db.query('SELECT webdock_auth.next_snowflake() AS id')).rows[0].id;
 const budget=await reserveMailBudget(db,access.customerID,id,new Set(command.envelope.to).size);
 // SMTP service credentials and policy proof are not configured yet; never accept undeliverable jobs.
 if(budget.path.kind==='stalwart')mailUnavailable();
 return enqueueMail(db,{id,customerID:access.customerID,sourceID:'key:'+access.keyID,idempotencyKey:command.idempotencyKey,requestHash:command.requestHash,payloadRef:command.payloadRef,payloadBytes:command.payloadBytes,route:{...budget.path,...route.binding},envelope:command.envelope,notBefore:command.notBefore?new Date(command.notBefore):undefined});
}
export async function beginSubmission(db:Connection,lease:SendLease){
 requireNativeSending();
 const job=(await db.query("SELECT * FROM webdock_mail.send_job WHERE id=$1 AND customer_id=$2 AND lease_token=$3 AND state='leased' AND lease_until>now()",[lease.id,lease.customerID,lease.leaseToken])).rows[0];
 if(!job)return null;
 const envelope=sendEnvelope.parse(job.envelope);
 try{
  if(!job.source_id.startsWith('key:'))mailUnavailable();
  await authorizeMailKeyID(db,job.customer_id,job.source_id.slice(4),envelope.from);
  const route=await transport(db,job.customer_id,envelope.from);
  const budget=await reserveMailBudget(db,job.customer_id,job.id,new Set(envelope.to).size);
  if(budget.state!=='reserved' || budget.path.kind!=='direct' || job.route.kind!=='direct' || job.route.transportRevision!==route.binding.transportRevision || job.route.mode!==route.binding.mode)mailUnavailable();
  if(!await beginHandoff(db,lease))return null;
  return {kind:'direct' as const,account:route.account};
 }catch(error){
  // Authentication/route rejection is safe to cancel before any external handoff.
  const {MailServiceError}=await import('@webdock/mail-core');
  if(!(error instanceof MailServiceError))throw error;
  await completionLock(db,job.customer_id);
  if(await cancelSend(db,job.customer_id,job.id))await settleMailBudget(db,job.customer_id,job.id,'released');
  return null;
 }
}
async function completionLock(db:Connection,customerID:string){
 await db.query('SELECT id FROM webdock_admin.customers WHERE id=$1 FOR SHARE',[customerID]);
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['mail-budget:'+customerID]);
}
export async function finishSubmission(db:Connection,lease:SendLease,result:{state:'accepted'|'rejected'|'unknown';providerID?:string}){
 await completionLock(db,lease.customerID);
 if(!await finishHandoff(db,lease,result))return false;
 if(result.state!=='unknown')await settleMailBudget(db,lease.customerID,lease.id,result.state==='accepted'?'accepted':'released');
 return true;
}
export async function submissionStatus(db:Connection,token:string,id:string,cancel=false){
 const access=await authorizeMailKey(db,token);
 const job=(await db.query('SELECT id,state FROM webdock_mail.send_job WHERE id=$1 AND customer_id=$2 AND source_id=$3',[id,access.customerID,'key:'+access.keyID])).rows[0];
 if(!job)mailUnavailable();
 if(cancel)await completionLock(db,access.customerID);
 if(cancel && await cancelSend(db,access.customerID,id)){await settleMailBudget(db,access.customerID,id,'released');job.state='cancelled';}
 return job as {id:string;state:string};
}

export async function rejectSubmissionPreparation(db:Connection,lease:SendLease){
 await completionLock(db,lease.customerID);
 if(!await rejectPreparation(db,lease))return false;
 await settleMailBudget(db,lease.customerID,lease.id,'released');return true;
}
