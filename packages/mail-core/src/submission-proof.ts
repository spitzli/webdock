import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
function invalid():never{throw Error('Invalid Mail submission proof.');}
function canonical(headers:unknown,body:unknown){
 if(!Array.isArray(headers) || headers.length>1000 || typeof body!=='string' || Buffer.byteLength(body)>25*1024*1024)invalid();
 const normalized:[string,string][]=[];let size=0;
 for(const pair of headers){
  if(!Array.isArray(pair) || pair.length!==2 || typeof pair[0]!=='string' || !/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(pair[0]) || typeof pair[1]!=='string' || pair[1].includes('\0'))invalid();
  size+=Buffer.byteLength(pair[0])+Buffer.byteLength(pair[1]);if(size>131072)invalid();
  const name=pair[0].toLowerCase();if(name==='x-webdock-submission')continue;
  normalized.push([name,pair[1].replace(/\r?\n[ \t]+/g,' ').replace(/[ \t]+/g,' ').trim()]);
 }
 return createHash('sha256').update(JSON.stringify([normalized,body.replace(/\r\n/g,'\n').replace(/\n*$/,'')])).digest('hex');
}
export function messageDigest(raw:Buffer){
 if(!Buffer.isBuffer(raw) || raw.length>25*1024*1024)invalid();
 const text=raw.toString('utf8');if(!Buffer.from(text).equals(raw) || text.includes('\0'))invalid();
 const boundary=text.indexOf('\r\n\r\n');if(boundary<0)invalid();
 const headers:[string,string][]=[];
 for(const line of text.slice(0,boundary).split('\r\n')){
  if(/^[ \t]/.test(line)){if(!headers.length)invalid();headers[headers.length-1][1]+='\r\n'+line;continue;}
  const colon=line.indexOf(':');if(colon<1)invalid();headers.push([line.slice(0,colon),line.slice(colon+1)]);
 }
 return canonical(headers,text.slice(boundary+4));
}
export function hookMessageDigest(message:{headers:unknown;contents:unknown;size:unknown}){
 if(!Number.isSafeInteger(message.size) || Number(message.size)<1 || Number(message.size)>25*1024*1024)invalid();
 return canonical(message.headers,message.contents);
}
export type SubmissionProof={customerID:string;id:string;digest:string;from:string;to:string[];transportRevision:string;serviceRevision:string};
export function signSubmission(context:SubmissionProof,key:string){
 const master=Buffer.from(key,'base64');if(master.length!==32 || master.toString('base64')!==key)invalid();
 if(![context.customerID,context.id,context.transportRevision,context.serviceRevision].every(value=>/^[1-9][0-9]{0,18}$/.test(value)) || !/^[a-f0-9]{64}$/.test(context.digest) || !Array.isArray(context.to) || !context.to.length || context.to.length>100)invalid();
 const derived=createHmac('sha256',master).update('webdock:submission-proof-key:v1').digest();
 return createHmac('sha256',derived).update(JSON.stringify([context.customerID,context.id,context.digest,context.from,[...new Set(context.to)].sort(),context.transportRevision,context.serviceRevision])).digest('base64url');
}
export function verifySubmission(context:SubmissionProof,proof:string,key:string){
 if(typeof proof!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(proof))return false;
 return timingSafeEqual(Buffer.from(signSubmission(context,key)),Buffer.from(proof));
}
