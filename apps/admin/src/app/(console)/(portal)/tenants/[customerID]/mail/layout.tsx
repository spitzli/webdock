import { AreaNavigation } from '@/components/area-navigation';
import { getRequestI18n } from '@webdock/i18n/next';
import { getTenant } from '@/lib/tenants';
import { headers } from 'next/headers';
export default async function MailLayout({children,params}: {children:React.ReactNode;params:Promise<{customerID:string}>}) {
  const {customerID}=await params, {t}=await getRequestI18n();
  const {canManage}=await getTenant(await headers(),customerID), base=`/tenants/${customerID}/mail`;
  return <><AreaNavigation label={t('Mail areas')} links={[
    {href:base,label:t('Overview'),exact:true},
    {href:base+'/sending',label:t('Sending')},
    {href:base+'/mailboxes',label:t('Mailboxes'),activePaths:[base+'/inbox']},
    {href:base+'/domains',label:t('Sender domains')},
    ...(canManage ? [{href:base+'/keys',label:t('Mail credentials')},{href:base+'/tracking',label:t('Tracking')},{href:base+'/settings',label:t('Settings')}] : []),
  ]}/>{children}</>;
}
