import type { EmailRequest, PageQuery } from './index';
import { MAIL_LIMITS as L } from './limits';
export class MailValidationError extends Error { constructor(message: string) { super(message); this.name='validation_error'; } }
const fail = (message: string): never => { throw new MailValidationError(message); };
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
const controls = /[\x00-\x1f\x7f]/;
export function parseID(value: unknown): string {
 if(typeof value!=='string' || !/^[1-9][0-9]{0,18}$/.test(value)) fail('Invalid resource ID');
 return value as string;
}
export function parsePageQuery(input: PageQuery): {limit:number;after?:string} {
 const limit=input.limit??20;
 if(!Number.isInteger(limit)||limit<1||limit>L.page || (input.after!==undefined && (typeof input.after!=='string'||input.after.length>256))) fail('Invalid pagination');
 return {limit,...(input.after?{after:input.after}:{})};
}
function record(value:unknown):Record<string,unknown>{
 if(!value || typeof value!=='object'||Array.isArray(value)) fail('Expected an object');
 return value as Record<string,unknown>;
}
export function parseAddress(value:unknown):string {
 if(typeof value!=='string'||value.length>320||controls.test(value)) fail('Invalid email address');
 const raw=(value as string).trim();
 const angle=/^(?:[^<>]+\s)?<([^<>]+)>$/.exec(raw);
 const address=(angle?angle[1]:raw).toLowerCase();
 if(address.length>254||! /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(address)||address.includes('..')) fail('Invalid email address');
 return address;
}
function addresses(value:unknown,required=false):string[]{
 if(value===undefined && !required)return [];
 const list=Array.isArray(value)?value:[value];
 if(list.length>L.recipients || (required && list.length===0))fail('Invalid recipient count');
 return list.map(parseAddress);
}
export function parseEmail(value:unknown,now:Date,options:{ignoreScheduleTime?:boolean;batch?:boolean}={}) {
 const input=record(value);
 const fromEmail=parseAddress(input.from);
 const recipients:{email:string;category:'to'|'cc'|'bcc'}[]=[];
 const seen=new Set<string>();
 for(const category of ['to','cc','bcc'] as const) for(const email of addresses(input[category],category==='to')) if(!seen.has(email)){seen.add(email);recipients.push({email,category});}
 if(recipients.length>L.recipients)fail('Too many recipients');
 if(typeof input.subject!=='string'||controls.test(input.subject)||bytes(input.subject)>L.subjectBytes)fail('Invalid subject');
 for(const key of ['html','text']) if(input[key]!==undefined && typeof input[key]!=='string')fail('Invalid content');
 if(!input.text&&!input.html)fail('Text or HTML is required');
 if(bytes(String(input.text??''))+bytes(String(input.html??''))>L.contentBytes)fail('Content too large');
 const replyTo=addresses(input.reply_to);
 const headers:Record<string,string>={};
 if(input.headers!==undefined){
  const entries=Object.entries(record(input.headers));
  if(entries.length>L.headers)fail('Too many headers');
  for(const [name,v] of entries){
   if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)||typeof v!=='string'||controls.test(v)|| /^(from|to|cc|bcc|subject|reply-to|sender|return-path|received|date|message-id|mime-version|content-.*|resent-.*|dkim-.*|arc-.*|authentication-results|x-webdock-.*|x-turbo.*|x-smtpapi)$/i.test(name))fail('Invalid or reserved header');
   if(Object.keys(headers).some(k=>k.toLowerCase()===name.toLowerCase()))fail('Duplicate header');
   headers[name]=v as string;
  }
  if(bytes(JSON.stringify(headers))>L.headerBytes)fail('Headers too large');
 }
 if(input.tags!==undefined && (!Array.isArray(input.tags)||input.tags.length>L.tags))fail('Invalid tags');
 const tags=(input.tags??[]) as unknown[];
 for(const tag of tags){const t=record(tag);if(![t.name,t.value].every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(v)))fail('Invalid tag');}
 if(input.attachments!==undefined && (!Array.isArray(input.attachments)||input.attachments.length>L.attachments))fail('Invalid attachments');
 let attachmentBytes=0;
 for(const raw of (input.attachments??[]) as unknown[]){
  const a=record(raw);
  if(Object.keys(a).some(k=>!['content','filename','content_type','content_id'].includes(k))||typeof a.content!=='string'|| !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.content))fail('Invalid Base64 attachment');
  const content=a.content as string;
  // Check encoded length before decoding; avoids allocating oversized attacker payloads.
  const size=content.length/4*3-(content.endsWith('==')?2:content.endsWith('=')?1:0);
  attachmentBytes+=size;if(attachmentBytes>L.attachmentBytes)fail('Attachments too large');
  for(const key of ['filename','content_type','content_id']) if(a[key]!==undefined && (typeof a[key]!=='string'||!a[key]||String(a[key]).length>255||controls.test(String(a[key]))))fail('Invalid attachment metadata');
  if(a.filename && /[\\/]/.test(String(a.filename)))fail('Invalid attachment filename');
 }
 if(input.scheduled_at!==undefined){
  if(typeof input.scheduled_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(input.scheduled_at))fail('Schedule requires explicit timezone');
  const time=Date.parse(input.scheduled_at as string);
  if(!Number.isFinite(time)||(!options.ignoreScheduleTime&&(time<=now.getTime()||time>now.getTime()+L.scheduleDays*86400_000)))fail('Invalid schedule time');
 }
 if(options.batch && (input.scheduled_at!==undefined||input.attachments!==undefined))fail('Batch cannot contain attachments or schedules');
 const simulated=recipients.filter(r=>r.email.endsWith('@test.mail.webdock.dev'));
 if(simulated.length && (simulated.length!==recipients.length||simulated.some(r=>!['delivered','bounced','complained'].includes(r.email.split('@')[0]))))fail('Invalid mixed simulator recipients');
 const request:EmailRequest={from:input.from as string,to:recipients.filter(r=>r.category==='to').map(r=>r.email),subject:input.subject as string,
  cc:recipients.filter(r=>r.category==='cc').map(r=>r.email),bcc:recipients.filter(r=>r.category==='bcc').map(r=>r.email),reply_to:replyTo,headers,tags:tags as EmailRequest['tags'],
  ...(input.text!==undefined?{text:input.text as string}:{}),...(input.html!==undefined?{html:input.html as string}:{}),
  ...(input.attachments!==undefined?{attachments:input.attachments as EmailRequest['attachments']}:{}),...(input.scheduled_at!==undefined?{scheduled_at:input.scheduled_at as string}:{})};
 return {request,fromEmail,recipients,attachmentBytes,simulated:simulated.length>0};
}
