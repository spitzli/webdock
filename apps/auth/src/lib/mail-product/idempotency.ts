import {createHash,randomUUID} from 'node:crypto';
import type {MailActor,ApiResult} from '@webdock/mail-contracts';
import {assertMailAccess,MailError} from './access';
import {withMailTransaction} from './store';
import {database} from '../db';
export function canonicalHash(value:unknown):string{
 const canonical=(v:unknown):string=>{
  if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
  if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical((v as Record<string,unknown>)[k])).join(',')+'}';
  const out=JSON.stringify(v);if(out===undefined)throw new MailError(422,'validation_error','Invalid JSON value');return out;
 };
 return createHash('sha256').update(canonical(value)).digest('hex');
}
export async function reserveMailRequest(actor:MailActor,input:{key:string;method:string;path:string;body:unknown;now:Date}):Promise<{kind:'reserved';token:string}|{kind:'replay';result:ApiResult}>{
 if(typeof input.key!=='string'||! /^[\x21-\x7e]{1,256}$/.test(input.key))throw new MailError(422,'validation_error','Invalid idempotency key');
 const hash=canonicalHash(input.body);
 return withMailTransaction(async db=>{
  await assertMailAccess(actor,'send',db,false);
  // The lock serializes even the initial absence; ON CONFLICT alone cannot fence cleanup.
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[actor.customerID+':'+actor.connectionID+':'+input.key]);
  let existing=(await db.query('SELECT * FROM webdock_auth.mail_idempotency WHERE customer_id=$1 AND connection_id=$2 AND key=$3 FOR UPDATE',[actor.customerID,actor.connectionID,input.key])).rows[0];
  if(existing?.status==='completed'&&existing.expires_at&&new Date(existing.expires_at)<=input.now){
   await db.query('DELETE FROM webdock_auth.mail_idempotency WHERE customer_id=$1 AND connection_id=$2 AND key=$3',[actor.customerID,actor.connectionID,input.key]);existing=undefined;
  }
  if(existing){
   if(existing.method!==input.method||existing.path!==input.path||existing.body_hash!==hash)throw new MailError(409,'idempotency_conflict','Idempotency key was used for another request');
   if(existing.response_status!==null)return {kind:'replay',result:{status:existing.response_status,body:existing.response_body}};
   throw new MailError(409,'request_in_progress','This request is already in progress');
  }
  await assertMailAccess(actor,'send',db);
  const token=randomUUID();
  await db.query("INSERT INTO webdock_auth.mail_idempotency(customer_id,connection_id,key,method,path,body_hash,status,created_at,operation_token) VALUES($1,$2,$3,$4,$5,$6,'pending',$7,$8)",[actor.customerID,actor.connectionID,input.key,input.method,input.path,hash,input.now,token]);
  return {kind:'reserved',token};
 });
}
/** Internal completion only, never a customer HTTP action. Unknown results have no TTL. */
export async function completeMailRequest(actor:MailActor,key:string,token:string,result:ApiResult,unknown:boolean,now:Date):Promise<void>{
 await database.query("UPDATE webdock_auth.mail_idempotency SET status=$4,response_status=$5,response_body=$6,expires_at=$7 WHERE customer_id=$1 AND connection_id=$2 AND key=$3 AND status='pending' AND operation_token=$8",[actor.customerID,actor.connectionID,key,unknown?'unknown':'completed',result.status,JSON.stringify(result.body),unknown?null:new Date(now.getTime()+86400_000),token]);
}
export async function runIdempotent(actor:MailActor,input:{key:string;method:string;path:string;body:unknown},run:(token:string)=>Promise<ApiResult>,now=new Date()):Promise<ApiResult>{
 let reservation;
 try {reservation=await reserveMailRequest(actor,{...input,now});}
 catch(error){if(error instanceof MailError)return {status:error.status,body:{statusCode:error.status,name:error.code,message:error.message}};throw error;}
 if(reservation.kind==='replay')return reservation.result;
 const result=await run(reservation.token);
 const unknown=result.body!==null&&typeof result.body==='object'&&'name' in result.body&&result.body.name==='send_outcome_unknown';
 try {await completeMailRequest(actor,input.key,reservation.token,result,unknown,now);}
 catch(error){
  const body=result.body as {id?:unknown;email_id?:unknown}|null;
  const id=body&&typeof body==='object'?(body.email_id??body.id):undefined;
  if(typeof id==='string')return {status:502,body:{statusCode:502,name:'send_outcome_unknown',message:'Saved response is uncertain; do not resend',email_id:id}};
  throw error;
 }
 return result;
}
