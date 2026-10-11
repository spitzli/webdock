import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {parseSendRequest,compileSendRequest} from '../sending/request.ts';
import type {PrivatePayloadStore} from '../sending/payload-store.ts';
export type MailControl=(body:Record<string,unknown>)=>Promise<unknown>;
export class MailControlError extends Error{readonly status:number;constructor(status:number){super('Mail access is unavailable.');this.status=status;}}
function reply(response:ServerResponse,status:number,body:unknown){response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(body));}
async function readJSON(request:IncomingMessage){
 if(!/^application\/json(?:;|$)/i.test(request.headers['content-type']??''))throw new MailControlError(415);
 const chunks:Buffer[]=[];let size=0;
 const timer=setTimeout(()=>request.destroy(),20000);
 try{for await(const chunk of request){size+=chunk.length;if(size>16*1024*1024)throw new MailControlError(413);chunks.push(Buffer.from(chunk));}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 finally{clearTimeout(timer);}
}
export function createMailAPI(control:MailControl,store:PrivatePayloadStore){
 let active=0;
 const server=createServer(async(request,response)=>{
  if(request.url==='/health' && request.method==='GET'){reply(response,200,{ok:true});return;}
  if(active>=4){reply(response,429,{error:'Mail is busy. Try later.'});return;}active++;
  try{
   const token=request.headers.authorization?.match(/^Bearer (wd_mail_[A-Za-z0-9_-]{43})$/)?.[1];
   if(!token)throw new MailControlError(401);
   const path=request.url??'';
   const existing=/^\/v1\/emails\/([1-9][0-9]{0,18})$/.exec(path);
   if(existing && ['GET','DELETE'].includes(request.method??'')){
    const result=await control({action:'send.status',token,id:existing[1],cancel:request.method==='DELETE'});reply(response,200,result);return;
   }
   if(path!=='/v1/emails' || request.method!=='POST'){reply(response,404,{error:'Not found.'});return;}
   const header=request.headers['idempotency-key'];
   if(header!==undefined && (typeof header!=='string' || !/^[\x21-\x7e]{1,200}$/.test(header)))throw new MailControlError(400);
   let message;
   try{message=parseSendRequest(await readJSON(request));}catch(error){if(error instanceof MailControlError)throw error;throw new MailControlError(400);}
   const envelope={from:message.from.email,to:[...message.to,...message.cc??[],...message.bcc??[]]};
   const access=await control({action:'send.preflight',token,envelope}) as {customerID:string};
   if(!access || !/^[1-9][0-9]{0,18}$/.test(access.customerID))throw new MailControlError(503);
   try{await compileSendRequest(message);}catch{throw new MailControlError(413);}
   const payload=Buffer.from(JSON.stringify(message));const saved=await store.put(access.customerID,payload);
   let result:{id:string;state:string;created:boolean};
   try{
    result=await control({action:'send.admit',submission:{token,idempotencyKey:header??randomUUID(),requestHash:createHash('sha256').update(payload).digest('hex'),payloadRef:saved.ref,payloadBytes:saved.bytes,envelope,...(message.scheduled_at?{notBefore:message.scheduled_at}:{})}}) as typeof result;
   }catch(error){
    // A timed-out control request may have committed. Never delete its only payload on uncertainty.
    if(error instanceof MailControlError && [400,401,403].includes(error.status))await store.remove(saved.ref);
    throw error;
   }
   if(!result || !/^[1-9][0-9]{0,18}$/.test(result.id) || typeof result.created!=='boolean')throw new MailControlError(503);
   if(!result.created)await store.remove(saved.ref);
   reply(response,202,{id:result.id,state:result.state});
  }catch(error){reply(response,error instanceof MailControlError?error.status:503,{error:'Mail request could not be completed.'});}
  finally{active--;}
 });
 server.headersTimeout=10000;server.requestTimeout=20000;server.keepAliveTimeout=5000;server.maxHeadersCount=40;
 return server;
}
