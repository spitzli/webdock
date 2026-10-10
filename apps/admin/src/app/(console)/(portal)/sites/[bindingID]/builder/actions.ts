'use server';
import {headers} from 'next/headers';
import {revalidatePath} from 'next/cache';
import {writeCanvas,type CanvasCommand} from '@/lib/canvas-bridge';
import type {CanvasPage} from '@webdock/page-builder/model';
export type {CanvasCommand};
export type CanvasResult={ok:true;page?:CanvasPage;homePageID?:number|null}|{ok:false;error:string};
export async function canvasCommand(bindingID:string,command:CanvasCommand):Promise<CanvasResult>{
 try{
  const h=await headers();if(h.get('origin')!==new URL(process.env.NEXT_PUBLIC_SERVER_URL||'https://studio.webdock.dev').origin)throw Error('Ungültiger Ursprung.');
  if(!/^[1-9]\d{0,18}$/.test(bindingID))throw Error('Ungültige Website.');
  const result=await writeCanvas(bindingID,command);revalidatePath(`/sites/${bindingID}/builder`);return {ok:true,...result};
 }catch(error){return {ok:false,error:error instanceof Error?error.message.slice(0,400):'Die Aktion konnte nicht abgeschlossen werden.'};}
}
