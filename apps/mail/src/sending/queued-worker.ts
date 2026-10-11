import {createHash} from 'node:crypto';
import type {SendLease} from '@webdock/mail-core/outbox';
import type {MailControl} from '../api/server.ts';
import type {PrivatePayloadStore} from './payload-store.ts';
import {parseStoredRequest,compileSendRequest} from './request.ts';
import {dispatchOne,type DispatchAuthorization} from './dispatch.ts';
export async function processQueuedSend(control:MailControl,store:PrivatePayloadStore,transports:Parameters<typeof dispatchOne>[2]={}){
 return dispatchOne({
  claim:async()=>await control({action:'send.claim'}) as SendLease|null,
  prepareFailed:async lease=>await control({action:'send.rejectPreparation',lease})===true,
  begin:async lease=>await control({action:'send.begin',lease}) as DispatchAuthorization|null,
  finish:async(lease,result)=>{
   const recorded=await control({action:'send.finish',lease,result});
   if(recorded===true && result.state!=='unknown')await store.remove(lease.payloadRef);
   return recorded===true;
  },
 },async job=>{
  const payload=await store.get(job.customerID,job.payloadRef);
  if(payload.length!==job.payloadBytes || createHash('sha256').update(payload).digest('hex')!==job.requestHash)throw Error('Mail payload integrity check failed.');
  const request=parseStoredRequest(JSON.parse(payload.toString('utf8')));
  const envelope={from:request.from.email,to:[...request.to,...request.cc??[],...request.bcc??[]]};
  if(envelope.from!==job.envelope.from || JSON.stringify(envelope.to)!==JSON.stringify(job.envelope.to))throw Error('Mail envelope does not match its admission.');
  return compileSendRequest(request);
 },transports);
}
