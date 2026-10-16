'use server';
import {revalidatePath} from 'next/cache';
import {studioCall} from '@/lib/studio-client';
import {StudioError} from '@/lib/studio-errors';
export type ManualState={error?:string;success?:string};
export async function manualReleaseAction(_state:ManualState,form:FormData):Promise<ManualState>{
 const customerID=String(form.get('customerID')||'');
 try{await studioCall('billing.manualRelease',[{customerID,contractID:form.get('contractID'),revision:Number(form.get('revision')),confirmName:form.get('confirmName'),reason:form.get('reason')}]);revalidatePath('/customers/'+customerID+'/billing');return{success:'Manual management released. Existing allowances remain unchanged until an explicit plan edit.'};}
 catch(error){return{error:error instanceof StudioError?error.message:'Manual release could not be confirmed.'};}
}
export async function refreshBillingAction(_state:ManualState,form:FormData):Promise<ManualState>{
 const customerID=String(form.get('customerID')||'');
 try{await studioCall('billing.refreshCustomer',[{customerID,environment:form.get('environment')}]);revalidatePath('/customers/'+customerID+'/billing');return{success:'Current provider state will be checked.'};}
 catch(error){return{error:error instanceof StudioError?error.message:'The read operation could not be queued.'};}
}
