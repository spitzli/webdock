import {MailNavigation} from '@/components/mail/mail-navigation';
import {notFound} from 'next/navigation';
import {AccessError} from '@/lib/studio-errors';
import { getTenant } from '@/lib/tenants';
import { headers } from 'next/headers';
export default async function MailLayout({children,params}: {children:React.ReactNode;params:Promise<{customerID:string}>}) {
  const {customerID}=await params;
  const {canManage}=await getTenant(await headers(),customerID).catch(error=>{if(error instanceof AccessError)notFound();throw error;});
  return <><MailNavigation customerID={customerID} canManage={canManage}/>{children}</>;
}
