'use server';
import {revalidatePath} from 'next/cache';
import {studioCall} from '@/lib/studio-client';
import {StudioError} from '@/lib/studio-errors';
export type BillingState={error?:string;success?:string};
export async function billingConnectionAction(_state:BillingState,form:FormData):Promise<BillingState>{
 try{
  await studioCall('billing.saveConnection',[{environment:form.get('environment'),revision:form.get('revision'),token:form.get('token')}]);
  revalidatePath('/admin/billing');return{success:'Billing connection saved.'};
 }catch(error){return{error:error instanceof StudioError?error.message:'Billing connection could not be saved. Refresh and review its current status.'};}
}
export async function billingSwitchesAction(_state:BillingState,form:FormData):Promise<BillingState>{
 try{
  await studioCall('billing.switches',[{environment:form.get('environment'),revision:form.get('revision'),salesEnabled:form.get('salesEnabled')==='on',catalogPublishEnabled:form.get('catalogPublishEnabled')==='on',enforcementEnabled:form.get('enforcementEnabled')==='on'}]);
  revalidatePath('/admin/billing');return{success:'Billing settings saved.'};
 }catch(error){return{error:error instanceof StudioError?error.message:'Billing settings could not be saved. Refresh and review their current status.'};}
}

export async function billingEndpointAction(_state:BillingState,form:FormData):Promise<BillingState>{
 try{
  await studioCall('billing.endpoint',[{environment:form.get('environment'),revision:form.get('revision'),mode:form.get('mode'),...(form.get('endpointID')?{endpointID:form.get('endpointID')}:{}),...(form.get('secret')?{secret:form.get('secret')}:{})}]);
  revalidatePath('/admin/billing');return{success:'Webhook configuration saved.'};
 }catch(error){return{error:error instanceof StudioError?error.message:'Webhook setup could not be confirmed. Review Polar before trying another creation.'};}
}
export async function sandboxCustomerAction(_state:BillingState,form:FormData):Promise<BillingState>{
 try{await studioCall('billing.enableSandbox',[form.get('customerID')]);return{success:'Customer enabled for sandbox billing.'};}
 catch(error){return{error:error instanceof StudioError?error.message:'Sandbox customer could not be enabled.'};}
}
export async function retryBillingReadAction(_state:BillingState,form:FormData):Promise<BillingState>{
 try{await studioCall('billing.retryReadJob',[form.get('jobID')]);revalidatePath('/admin/billing');return{success:'Read operation queued again.'};}
 catch(error){return{error:error instanceof StudioError?error.message:'The read operation could not be queued.'};}
}
