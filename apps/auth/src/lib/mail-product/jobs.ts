import {recoverTerminalQuotas} from './quota';
import {refreshBatchIdempotency} from './idempotency';
import {randomUUID} from 'node:crypto';import {mailDatabase as database} from './store';import {withMailDeadline} from './deadline';import {withMailTransaction} from './store';
import {dispatchMail} from './sending';import {advanceMailBatch} from './batches';import {processCallbackInbox} from './callback-inbox';import {deliverDueWebhooks} from './webhooks';import {pruneMailData} from './retention';import {recordMailEvent} from './events';import {MailError} from './access';
export const mailJobs=['dispatch','events','webhooks','maintenance'] as const;export type MailJob=typeof mailJobs[number];
export async function runMailJob(job:MailJob,requestedDeadline:Date):Promise<{job:MailJob;processed:number;durationMs:number;skipped?:boolean;failed?:boolean}>{
 if(!mailJobs.includes(job)||!Number.isFinite(requestedDeadline.getTime()))throw new MailError(422,'invalid_job','Invalid Mail job');
 const started=Date.now(),end=new Date(Math.min(requestedDeadline.getTime(),started+45000));
 return withMailDeadline(end,()=>runClaimedJob(job,new Date(end.getTime()-2000),started));
}
async function runClaimedJob(job:MailJob,deadline:Date,started:number){
 const token=randomUUID();
 const lease=(await database.query(`INSERT INTO webdock_auth.mail_job_lease(name,claim_token,lease_until) VALUES($1,$2,now()+interval '60 seconds')
 ON CONFLICT(name) DO UPDATE SET claim_token=$2,lease_until=now()+interval '60 seconds' WHERE mail_job_lease.lease_until<now() RETURNING cursor`,[job,token])).rows[0];
 if(!lease)return {job,processed:0,durationMs:Date.now()-started,skipped:true};
 const run=(await database.query("INSERT INTO webdock_auth.mail_job_run(name,status) VALUES($1,'running') RETURNING id",[job])).rows[0].id;
 let processed=0,failed=false,cursor=lease.cursor as string|null;
 try{await withMailDeadline(deadline,async()=>{
  if(job==='events'||job==='webhooks'){
   const limit=job==='events'?500:100;
   for(let batch=0;batch<10&&Date.now()+500<deadline.getTime();batch++){
    const count=job==='events'?(await processCallbackInbox({limit,deadline})).processed:(await deliverDueWebhooks({limit,deadline})).processed;
    processed+=count;if(count<limit)break;
   }
   return;
  }
  if(job==='maintenance'){
   processed=await recoverTerminalQuotas();
   for(let batch=0;batch<100&&Date.now()+500<deadline.getTime();batch++){
    const counts=Object.values(await pruneMailData(new Date()));processed+=counts.reduce((a,b)=>a+b,0);
    if(counts.every(count=>count<500))break;
   }
   return;
  }
  // A expired dispatch is uncertain, never a candidate for automatic resubmission.
  await database.query("UPDATE webdock_auth.mail_message SET dispatch_status='outcome_unknown',error_code='dispatch_lease_expired',lease_until=NULL WHERE dispatch_status='dispatching' AND lease_until<now() AND id IN (SELECT id FROM webdock_auth.mail_message WHERE dispatch_status='dispatching' AND lease_until<now() LIMIT 100)");
  await finalizeInvalidSchedules();
  await finalizeStoppedBatches();
  const flags=(await database.query('SELECT settings FROM webdock_auth.platform_settings WHERE id=true')).rows[0]?.settings;
  if(flags?.mailGatewayEnabled!==true||flags?.mailDispatchEnabled!==true)return;
  const tenants=(await database.query(`SELECT customer_id FROM (SELECT m.customer_id FROM webdock_auth.mail_message m JOIN webdock_auth.mail_connection c ON c.id=m.connection_id JOIN webdock_admin.customers t ON t.id=m.customer_id WHERE m.dispatch_status='scheduled' AND (m.scheduled_at IS NULL OR m.scheduled_at<=now()) AND c.state='ready' AND c.deleted_at IS NULL AND t.status='active' UNION SELECT b.customer_id FROM webdock_auth.mail_batch b JOIN webdock_auth.mail_connection c ON c.id=b.connection_id JOIN webdock_admin.customers t ON t.id=b.customer_id WHERE b.status='processing' AND c.state='ready' AND c.deleted_at IS NULL AND t.status='active') t
   ORDER BY (customer_id>coalesce($1,'')) DESC,customer_id LIMIT 20`,[cursor])).rows;
  for(const tenant of tenants){
   if(Date.now()+15000>deadline.getTime())break;cursor=tenant.customer_id;
   const work=(await database.query(`SELECT m.id,'message' AS kind,coalesce(m.scheduled_at,m.created_at) AS due FROM webdock_auth.mail_message m
    JOIN webdock_auth.mail_connection c ON c.id=m.connection_id WHERE m.customer_id=$1 AND m.dispatch_status='scheduled' AND (m.scheduled_at IS NULL OR m.scheduled_at<=now()) AND c.state='ready' AND c.deleted_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM webdock_auth.mail_batch_item i WHERE i.message_id=m.id)
    UNION ALL SELECT b.id,'batch',b.created_at FROM webdock_auth.mail_batch b JOIN webdock_auth.mail_connection c ON c.id=b.connection_id WHERE b.customer_id=$1 AND b.status='processing' AND c.state='ready' AND c.deleted_at IS NULL
    ORDER BY due,id LIMIT 5`,[cursor])).rows;
   let budget=5;
   for(const item of work){if(budget<1||Date.now()+15000>deadline.getTime())break;
    if(item.kind==='batch'){await advanceMailBatch(item.id,deadline,{maxItems:budget});budget=0;processed++;}
    else{const outcome=await dispatchMail(item.id,deadline);if(outcome.kind!=='rejected'||outcome.code!=='not_dispatchable')processed++;budget--;}
   }
  }
 });}catch{failed=true;}
 finally{
  await database.query("UPDATE webdock_auth.mail_job_run SET status=$2,finished_at=now(),counts=$3 WHERE id=$1",[run,failed?'failed':'succeeded',JSON.stringify({processed,durationMs:Date.now()-started})]);
  await database.query('UPDATE webdock_auth.mail_job_lease SET cursor=$3,lease_until=now() WHERE name=$1 AND claim_token=$2',[job,token,cursor]);
 }
 return {job,processed,durationMs:Date.now()-started,...(failed?{failed:true}:{})};
}
async function finalizeInvalidSchedules(){
 await withMailTransaction(async db=>{
  const invalid=(await db.query(`SELECT m.id,m.customer_id,m.connection_id,CASE WHEN t.status<>'active' THEN 'tenant_archived' WHEN c.deleted_at IS NOT NULL THEN 'connection_removed' ELSE 'sender_removed' END AS reason
   FROM webdock_auth.mail_message m JOIN webdock_admin.customers t ON t.id=m.customer_id JOIN webdock_auth.mail_connection c ON c.id=m.connection_id JOIN webdock_auth.mail_sender_domain d ON d.id=m.domain_id
   WHERE m.dispatch_status='scheduled' AND (t.status<>'active' OR c.deleted_at IS NOT NULL OR d.deleted_at IS NOT NULL) LIMIT 100 FOR UPDATE OF m SKIP LOCKED`)).rows;
  for(const message of invalid){
   await db.query("UPDATE webdock_auth.mail_message SET dispatch_status='failed',error_code=$2,terminal_at=now() WHERE id=$1",[message.id,message.reason]);
   await db.query("UPDATE webdock_auth.mail_message_content SET encrypted_attachments=NULL,expires_at=now()+interval '30 days' WHERE message_id=$1",[message.id]);
   await recordMailEvent({customerID:message.customer_id,connectionID:message.connection_id,resourceID:message.id,type:'email.failed',source:'application',occurredAt:new Date().toISOString(),dedupeKey:'scheduled-failed:'+message.id,details:{code:message.reason}},db);
  }
  await db.query("UPDATE webdock_auth.mail_message m SET blocked_reason=CASE WHEN c.state='paused' THEN 'connection_paused' ELSE NULL END FROM webdock_auth.mail_connection c WHERE c.id=m.connection_id AND m.dispatch_status='scheduled' AND m.blocked_reason IS DISTINCT FROM CASE WHEN c.state='paused' THEN 'connection_paused' ELSE NULL END");
 });
}

async function finalizeStoppedBatches(){
 await withMailTransaction(async db=>{
  const batches=(await db.query(`SELECT b.id FROM webdock_auth.mail_batch b JOIN webdock_auth.mail_connection c ON c.id=b.connection_id JOIN webdock_admin.customers t ON t.id=b.customer_id
   WHERE b.status='processing' AND (b.lease_until IS NULL OR b.lease_until<now())
   AND (c.deleted_at IS NOT NULL OR t.status<>'active' OR EXISTS(SELECT 1 FROM webdock_auth.mail_batch_item i JOIN webdock_auth.mail_message m ON m.id=i.message_id WHERE i.batch_id=b.id AND i.status='pending' AND m.dispatch_status='failed'))
   AND NOT EXISTS(SELECT 1 FROM webdock_auth.mail_batch_item i JOIN webdock_auth.mail_message m ON m.id=i.message_id WHERE i.batch_id=b.id AND m.dispatch_status='dispatching')
   LIMIT 5 FOR UPDATE OF b SKIP LOCKED`)).rows;
  for(const batch of batches){
   const items=(await db.query(`SELECT i.item_index,i.message_id,m.dispatch_status,m.customer_id,m.connection_id FROM webdock_auth.mail_batch_item i JOIN webdock_auth.mail_message m ON m.id=i.message_id WHERE i.batch_id=$1 AND i.status='pending' ORDER BY i.item_index FOR UPDATE OF m`,[batch.id])).rows;
   const failed=items.find(i=>!['accepted','suppressed'].includes(i.dispatch_status));
   for(const item of items){
    const accepted=['accepted','suppressed'].includes(item.dispatch_status);
    await db.query('UPDATE webdock_auth.mail_batch_item SET status=$3 WHERE batch_id=$1 AND item_index=$2',[batch.id,item.item_index,accepted?'accepted':item===failed?'failed':'not_sent']);
    if(item.dispatch_status==='scheduled'){
     await db.query("UPDATE webdock_auth.mail_message SET dispatch_status='failed',error_code='batch_not_sent',terminal_at=now() WHERE id=$1",[item.message_id]);
     await db.query("UPDATE webdock_auth.mail_message_content SET encrypted_attachments=NULL,expires_at=now()+interval '30 days' WHERE message_id=$1",[item.message_id]);
     await recordMailEvent({customerID:item.customer_id,connectionID:item.connection_id,resourceID:item.message_id,type:'email.failed',source:'application',occurredAt:new Date().toISOString(),dedupeKey:'scheduled-failed:'+item.message_id,details:{code:'batch_not_sent'}},db);
    }
   }
   await db.query('UPDATE webdock_auth.mail_batch SET status=$2,failed_index=$3,failed_email_id=$4,finished_at=now(),claim_token=NULL,lease_until=NULL WHERE id=$1',[batch.id,failed?'failed':'succeeded',failed?.item_index??null,failed?.message_id??null]);
   await refreshBatchIdempotency(db,batch.id);
  }
 });
}
