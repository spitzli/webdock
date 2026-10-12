import 'server-only';
import {demoAccess} from './demo-bridges';
import {parseContentField as field, type WebsiteContentField} from './content-fields';
export type {WebsiteContentField} from './content-fields';
export type ContentVariant='modern'|'old';
async function contentCall(id:string,variant:ContentVariant,body?:{key:string;value:string;updatedAt:string}){
 if(variant!=='modern'&&variant!=='old')throw Error('Ungültige Seitenvariante.');
 // This rechecks live account membership and editor rights on every mutation.
 const {bridge}=await demoAccess(id,!!body);
 const response=await fetch(`${bridge.origin}/api/webdock/content${body?'':`?variant=${variant}`}`,{method:body?'POST':'GET',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${bridge.secret}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const reader=response.body?.getReader();if(!reader)throw Error('Inhaltsverwaltung nicht erreichbar.');
 const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1_200_000)throw Error('Antwort der Inhaltsverwaltung ist zu groß.');chunks.push(value)}}finally{void reader.cancel().catch(()=>{});}
 const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(!response.ok){if([400,404,409].includes(response.status)&&typeof data.error==='string')throw Error(data.error.slice(0,300));throw Error('Inhalte derzeit nicht erreichbar. Bitte später erneut versuchen.');}
 return data;
}
export async function websiteContent(id:string,variant:ContentVariant){const data=await contentCall(id,variant);if(!Array.isArray(data.docs)||data.docs.length>150)throw Error('Ungültige Inhaltsliste.');return {docs:data.docs.map(field).filter((f:WebsiteContentField)=>f.variant===variant) as WebsiteContentField[]};}
export async function saveWebsiteContent(id:string,variant:ContentVariant,body:{key:string;value:string;updatedAt:string}){return {doc:field((await contentCall(id,variant,body)).doc)};}
