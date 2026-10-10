'use server';
import {headers} from 'next/headers';
import {revalidatePath} from 'next/cache';
import {demoCalendarRequest} from '@/lib/demo-bridges';
export async function changeCalendar(_state:{error?:string;message?:string},form:FormData):Promise<{error?:string;message?:string}>{
 try{
  const h=await headers();if(h.get('origin')!==new URL(process.env.NEXT_PUBLIC_SERVER_URL||'https://studio.webdock.dev').origin)throw Error('Ungültiger Ursprung.');
  const id=String(form.get('bindingID')||'');if(!/^[1-9][0-9]{0,18}$/.test(id))throw Error('Ungültige Website.');
  const action=String(form.get('action'));let body:Record<string,unknown>;
  if(action==='settings'){const value=String(form.get('settings')||'');if(value.length>14000)throw Error('Zu viele Ausnahmen.');body={action,settings:JSON.parse(value),updatedAt:String(form.get('updatedAt'))};}
  else if(action==='create')body={action,date:String(form.get('date')),time:String(form.get('time')),durationMinutes:Number(form.get('durationMinutes')),units:Number(form.get('units')),label:String(form.get('label')||'Demo-Termin')};
  else if(action==='cancel')body={action,id:Number(form.get('id')),updatedAt:String(form.get('updatedAt'))};
  else throw Error('Ungültige Aktion.');
  await demoCalendarRequest(id,body);revalidatePath('/sites/'+id+'/calendar');revalidatePath('/sites/'+id+'/requests');
  return {message:action==='settings'?'Öffnungszeiten gespeichert.':action==='create'?'Termin eingetragen.':'Termin storniert.'};
 }catch(e){return {error:e instanceof Error?e.message:'Speichern fehlgeschlagen.'};}
}
