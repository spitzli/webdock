import {createHash} from 'node:crypto';
export const features = ['appointment','reservation','event','preorder','voucher','application'] as const;
export type Feature = typeof features[number];
export class RequestError extends Error { constructor(message:string,public status=400){super(message);} }
export type Input={feature:Feature;idempotencyKey:string;data:Record<string,string|number|boolean>};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const fail=(message:string):never=>{throw new RequestError(message);};
export function validateRequest(raw:unknown,enabled:readonly string[]):Input {
 if(!object(raw)||Object.keys(raw).some(k=>!['feature','idempotencyKey','data'].includes(k)))return fail('Ungültige Anfrage.');
 if(typeof raw.feature!=='string'||!features.includes(raw.feature as Feature)||!enabled.includes(raw.feature))return fail('Diese Demo-Funktion ist nicht verfügbar.');
 if(typeof raw.idempotencyKey!=='string'||! /^[A-Za-z0-9_-]{16,100}$/.test(raw.idempotencyKey))return fail('Ungültiger Anfrageschlüssel.');
 if(!object(raw.data)||Object.keys(raw.data).length>10)return fail('Ungültige Formulardaten.');
 const limits:Record<string,number>={name:100,email:254,phone:50,date:10,time:5,people:3,message:2000,service:160,amount:12};
 const data:Input['data']={};
 for(const key of Object.keys(raw.data).sort()){
  const value=raw.data[key];
  if(!Object.hasOwn(limits,key)||!['string','number'].includes(typeof value))return fail('Unbekanntes Formularfeld.');
  if(String(value).length>limits[key]||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(String(value)))return fail('Formularfeld ist zu lang oder ungültig.');
  const text=String(value).trim(); if(!text)continue;
  if(key==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))return fail('Ungültige E-Mail-Adresse.');
  if(key==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(text))||new Date(text).toISOString().slice(0,10)!==text))return fail('Ungültiges Datum.');
  if(key==='time'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(text))return fail('Ungültige Uhrzeit.');
  if(key==='people'&&(!/^\d+$/.test(text)||Number(text)<1||Number(text)>100))return fail('Personenzahl muss zwischen 1 und 100 liegen.');
  if(key==='amount'&&(!/^\d+(\.\d{1,2})?$/.test(text)||Number(text)<=0||Number(text)>1000))return fail('Ungültiger Demo-Betrag.');
  data[key]=key==='people'||key==='amount'?Number(text):text;
 }
 if(!data.name)return fail('Bitte einen Demo-Namen eingeben.');
 if(['appointment','reservation','event','preorder'].includes(raw.feature)&&(!data.date||!data.time))return fail('Bitte Datum und Uhrzeit auswählen.');
 if(['reservation','event'].includes(raw.feature)&&!data.people)return fail('Bitte Personenzahl angeben.');
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if(data.date&&String(data.date)<today)return fail('Bitte ein heutiges oder zukünftiges Datum auswählen.');
 return {feature:raw.feature as Feature,idempotencyKey:raw.idempotencyKey,data};
}
export function staffAccess(user:unknown,write=false):boolean{
 return object(user)&&user.collection==='users'&&(write?['operator','admin','editor']:['operator','admin','editor','reader']).includes(String(user.role));
}
export type Stored={id:string|number;fingerprint:string;idempotencyKey:string;mode:string;status:string};
export type Submission=Input & {site:string;fingerprint:string;mode:'demo';status:'pending'};
export type Store={find:(key:string)=>Promise<Stored|undefined>;create:(data:Submission)=>Promise<Stored>};
export async function saveRequest(store:Store,input:Input,site:string){
 const fingerprint=createHash('sha256').update(JSON.stringify({site,feature:input.feature,data:input.data})).digest('hex');
 const receipt=(row:Stored,replayed:boolean)=>{
  if(row.fingerprint!==fingerprint)throw new RequestError('Dieser Anfrageschlüssel wurde bereits verwendet.',409);
  return {id:row.id,mode:'demo' as const,status:'pending' as const,replayed,message:'Demo-Anfrage gespeichert. Es entsteht keine echte Buchung oder Bestellung.'};
 };
 const existing=await store.find(input.idempotencyKey);if(existing)return receipt(existing,true);
 try{return receipt(await store.create({...input,site,fingerprint,mode:'demo',status:'pending'}),false);}
 catch(error){const winner=await store.find(input.idempotencyKey);if(winner)return receipt(winner,true);throw error;}
}
export function requireOrigin(request:Request,origin:string){if(request.headers.get('origin')!==new URL(origin).origin)throw new RequestError('Ungültiger Ursprung.',403);}
export async function readBoundedJSON(request:Request){
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new RequestError('JSON erwartet.',415);
 const reader=request.body?.getReader();if(!reader)throw new RequestError('Leere Anfrage.');
 const chunks:Uint8Array[]=[];let total=0;
 while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>16384){await reader.cancel();throw new RequestError('Anfrage ist zu groß.',413);}chunks.push(value);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new RequestError('Ungültiges JSON.');}
}
