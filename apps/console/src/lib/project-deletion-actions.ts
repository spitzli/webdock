'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {studioCall} from './studio-client';
import {RegistryError} from './studio-errors';
import type {FormState} from './actions';
export async function removeProject(id:string,planHash:string,_state:FormState,form:FormData):Promise<FormState>{
 try{
  if(form.get('confirm')!=='yes')return{error:'Confirm permanent deletion.'};
  await studioCall('project.delete',[id,{planHash,confirmName:String(form.get('confirmName')||'')}]);
 }catch(error){return{error:error instanceof RegistryError?error.message:'Deletion stopped. Review its progress before retrying.'};}
 for(const path of ['/','/sites','/customers','/activity'])revalidatePath(path);
 redirect('/');
}
