'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {studioCall} from '@/lib/studio-client';
import {StudioError} from '@/lib/studio-errors';
export type PaymentState={error?:string;message?:string};
export async function purchaseAction(_state:PaymentState,form:FormData):Promise<PaymentState>{
 let result:{url?:string};const customerID=String(form.get('customerID')||'');
 try{
  result=await studioCall('billing.checkout',[{environment:form.get('environment'),customerID,versionID:form.get('versionID'),projectID:form.get('projectID'),bindingID:form.get('bindingID'),termsHash:form.get('termsHash'),acceptTerms:form.get('acceptTerms')==='on',...(form.get('offerToken')?{offerToken:form.get('offerToken')}:{})}]);
 }catch(error){return{error:error instanceof StudioError?error.message:'Payment could not be started. Review the existing attempt before trying again.'};}
 revalidatePath('/tenants/'+customerID+'/billing');if(result.url)redirect(result.url);return{message:'The payment attempt is being checked. Refresh its status shortly.'};
}
export async function paymentLinkAction(operation:'billing.portal'|'billing.resume',_state:PaymentState,form:FormData):Promise<PaymentState>{
 let result:{url?:string};const customerID=String(form.get('customerID')||'');
 try{result=await studioCall(operation,[{environment:form.get('environment'),customerID,...(operation==='billing.resume'?{attemptID:form.get('attemptID')}:{})}]);}
 catch(error){return{error:error instanceof StudioError?error.message:'Payment services are temporarily unavailable.'};}
 revalidatePath('/tenants/'+customerID+'/billing');if(result.url)redirect(result.url);return{message:'The payment attempt is being checked. Refresh its status shortly.'};
}
export async function subscriptionChangeAction(_state:PaymentState,form:FormData):Promise<PaymentState>{
 try{await studioCall('billing.change',[{environment:form.get('environment'),customerID:form.get('customerID'),subscriptionID:form.get('subscriptionID'),versionID:form.get('versionID'),operationID:form.get('operationID'),termsHash:form.get('termsHash'),acceptTerms:form.get('acceptTerms')==='on',...(form.get('offerToken')?{offerToken:form.get('offerToken')}:{})}]);revalidatePath('/tenants/'+String(form.get('customerID'))+'/billing');return{message:'Subscription change recorded. Service changes follow the confirmed payment or scheduled renewal.'};}
 catch(error){return{error:error instanceof StudioError?error.message:'The subscription update could not be confirmed. Review the existing update before retrying.'};}
}
export async function resumeChangeAction(_state:PaymentState,form:FormData):Promise<PaymentState>{
 try{await studioCall('billing.resumeChange',[{environment:form.get('environment'),customerID:form.get('customerID'),changeID:form.get('changeID')}]);revalidatePath('/tenants/'+String(form.get('customerID'))+'/billing');return{message:'Subscription change status checked.'};}
 catch(error){return{error:error instanceof StudioError?error.message:'The subscription update could not be confirmed. Review the existing update before retrying.'};}
}
