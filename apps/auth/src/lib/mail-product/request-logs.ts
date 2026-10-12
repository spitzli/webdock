import {createHash} from 'node:crypto';
/** Only structural metadata is logged. Arbitrary strings, including error text, are hashed. */
export function redactMailLog(value:unknown):unknown{
 const metadata=(s:string)=>({bytes:Buffer.byteLength(s),sha256:createHash('sha256').update(s).digest('hex')});
 const visit=(v:unknown,depth:number):unknown=>{
  if(depth>6)return '[depth limit]';
  if(typeof v==='string')return metadata(v);
  if(v===null||typeof v==='boolean'||typeof v==='number')return v;
  if(Array.isArray(v))return v.slice(0,50).map(item=>visit(item,depth+1));
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).slice(0,50).flatMap(([k,item])=>{
   if(/secret|token|password|authorization|cookie|signature|consumer.?key|api.?key|bcc|attachments|base64/i.test(k))return [];
   // Unknown keys can themselves contain secrets; retain only fixed API field names.
   if(!['from','to','cc','subject','html','text','headers','tags','name','value','content_type','filename','scheduled_at','status','statusCode','id','email_id','failed_index','error','url','nested','method','path'].includes(k))return [];
   return [[k,visit(item,depth+1)]];
  }));
  return null;
 };
 const result=visit(value,0);return Buffer.byteLength(JSON.stringify(result))>32768?{truncated:true}:result;
}
