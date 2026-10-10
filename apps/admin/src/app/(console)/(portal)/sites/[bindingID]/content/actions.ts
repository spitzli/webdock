'use server';
import {headers} from 'next/headers';
import {revalidatePath} from 'next/cache';
import {saveWebsiteContent} from '@/lib/demo-content';
export type ContentActionState={message?:string;error?:string;updatedAt?:string};
export async function updateWebsiteContent(_state:ContentActionState,form:FormData):Promise<ContentActionState>{
 try{
  const h=await headers();const origin=new URL(process.env.NEXT_PUBLIC_SERVER_URL||'https://studio.webdock.dev').origin;
  if(h.get('origin')!==origin)throw Error('Ungültiger Anfrageursprung.');
  const bindingID=String(form.get('bindingID')||'');const variant=String(form.get('variant')||'');
  if(!/^[1-9][0-9]{0,18}$/.test(bindingID)||(variant!=='modern'&&variant!=='old'))throw Error('Ungültige Website.');
  const key=String(form.get('key')||'');const value=form.get('value');const updatedAt=String(form.get('updatedAt')||'');
  if(!key.startsWith(variant+'_')||typeof value!=='string'||value.length>6000)throw Error('Ungültiger Inhalt.');
  const result=await saveWebsiteContent(bindingID,variant,{key,value,updatedAt});
  revalidatePath(`/sites/${bindingID}/content`);
  return {message:'Inhalt gespeichert. Die Website zeigt die Änderung beim nächsten Laden.',updatedAt:result.doc.updatedAt};
 }catch(error){return {error:error instanceof Error?error.message:'Inhalt konnte nicht gespeichert werden.'};}
}
