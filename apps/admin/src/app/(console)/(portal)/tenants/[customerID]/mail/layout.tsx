import {notFound} from 'next/navigation';import {AccessError} from '@/lib/studio-errors';
import {Suspense} from 'react';import {headers} from 'next/headers';import {getStudioSession} from '@/lib/studio-client';import {getTenant} from '@/lib/tenants';import {MailNavigation} from '@/components/mail/mail-navigation';
export default async function MailLayout({children,params}:{children:React.ReactNode;params:Promise<{customerID:string}>}){
 const {customerID}=await params;const session=await getStudioSession();if(!session||session.preview)return children;
 let tenant;try{tenant=await getTenant(await headers(),customerID);}catch(error){if(error instanceof AccessError)notFound();throw error;}
 return <><Suspense><MailNavigation customerID={customerID} canManage={tenant.canManage}/></Suspense>{children}</>;
}
