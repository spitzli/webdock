'use server';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {APIError} from 'payload';
import {requireOperator} from './server';
import {sso} from './sso';
import {deleteProject} from './project-deletion';
import type {FormState} from './actions';
export async function removeProject(id:string,planHash:string,_state:FormState,form:FormData):Promise<FormState>{
 const actor=await requireOperator();const session=await sso?.getDelegatedSession(await headers());
 try{
  if(form.get('confirm')!=='yes')return {error:'Confirm permanent deletion.'};
  await deleteProject({...actor,accessToken:session?.accessToken},id,{planHash,confirmName:String(form.get('confirmName')||'')});
 }catch(error){return {error:error instanceof APIError&&error.isPublic?error.message:'Deletion stopped. Review its progress before retrying.'};}
 for(const path of ['/','/sites','/customers','/activity'])revalidatePath(path);
 redirect('/');
}
