'use server';
import {headers} from 'next/headers';
import {revalidatePath} from 'next/cache';
import {shopRequest,type ShopKind} from '@/lib/studio-shop';
export async function saveShop(_state:{error?:string;message?:string;updatedAt?:string},form:FormData):Promise<{error?:string;message?:string;updatedAt?:string}>{try{
 const h=await headers();if(h.get('origin')!==new URL(process.env.NEXT_PUBLIC_SERVER_URL||'https://studio.webdock.dev').origin)throw Error('Ungültiger Ursprung.');
 const bindingID=String(form.get('bindingID')||'');if(!/^[1-9]\d{0,18}$/.test(bindingID))throw Error('Ungültige Website.');
 const kind=String(form.get('kind')) as ShopKind;const updatedAt=String(form.get('updatedAt'));let body:Record<string,unknown>;
 if(kind==='products'){
  const data:Record<string,unknown>={name:String(form.get('name')||''),description:String(form.get('description')||''),category:String(form.get('category')),available:form.get('available')==='on',sort:Number(form.get('sort')),tags:form.getAll('tags').map(String)};
  for(const name of ['variants','extras']){const count=Number(form.get(name+'Count'));if(!Number.isInteger(count)||count<0||count>32)throw Error('Ungültige Optionen.');data[name]=Array.from({length:count},(_,i)=>{const prefix=name+i;const raw=String(form.get(prefix+'price')||'').replace(',','.');if(!/^\d{1,4}(\.\d{1,2})?$/.test(raw))throw Error('Preise bitte in Euro mit höchstens zwei Nachkommastellen eingeben.');return {id:String(form.get(prefix+'id')||''),key:String(form.get(prefix+'key')||''),label:String(form.get(prefix+'label')||''),price:Math.round(Number(raw)*100)};});}
  if(form.has('image'))data.image=String(form.get('image')||'');if(form.has('photo'))data.photo=form.get('photo')?Number(form.get('photo')):null;
  body={kind,id:Number(form.get('id')),updatedAt,data};
 }else if(kind==='settings'){
  const section=String(form.get('section'));const fields:Record<string,string[]>={homepage:['headline','intro','featureTitle','featureCopy'],'site-settings':['name','phone','street','city','hours','notice'],promotion:['title','startsOn','endsOn','enabled']};if(!Object.hasOwn(fields,section))throw Error('Ungültiger Inhaltsbereich.');const data:Record<string,unknown>=Object.fromEntries(fields[section].map(k=>[k,k==='enabled'?form.get(k)==='on':String(form.get(k)||'')]));if(section==='homepage'){if(form.has('heroImage'))data.heroImage=form.get('heroImage')?Number(form.get('heroImage')):null;if(form.has('featuredProductsPresent'))data.featuredProducts=form.getAll('featuredProducts').map(String).filter(Boolean).map(Number);}body={kind,section,updatedAt,data};
 }else if(kind==='customers'){const count=Number(form.get('addressCount'));if(!Number.isInteger(count)||count<0||count>5)throw Error('Höchstens fünf Adressen sind möglich.');const addresses=Array.from({length:count},(_,i)=>Object.fromEntries(['label','street','postalCode','city'].map(key=>[key,String(form.get('address'+i+key)||'')])));body={kind,id:Number(form.get('id')),updatedAt,data:{name:String(form.get('name')||''),addresses}};
 }else throw Error('Dieser Bereich ist schreibgeschützt.');
 const result=await shopRequest(bindingID,kind,1,body) as unknown as {product?:{updatedAt?:unknown};section?:{updatedAt?:unknown};customer?:{updatedAt?:unknown}};
 const stamp=(kind==='products'?result.product:kind==='settings'?result.section:result.customer)?.updatedAt;
 if(typeof stamp!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stamp)||!Number.isFinite(Date.parse(stamp))||new Date(stamp).toISOString()!==stamp)throw Error('Gespeichert, aber der neue Versionsstand fehlt. Bitte vor weiteren Änderungen neu laden.');
 revalidatePath('/sites/'+bindingID+'/shop');return {message:'Gespeichert. Die Änderung ist in der Demo sichtbar.',updatedAt:stamp};
 }catch(e){return {error:e instanceof Error?e.message:'Speichern fehlgeschlagen.'};}}
