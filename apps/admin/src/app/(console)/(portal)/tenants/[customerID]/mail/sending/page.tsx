import {headers} from 'next/headers';
import Link from 'next/link';
import {getRequestI18n} from '@webdock/i18n/next';
import {getNativeSending} from '@/lib/mail-sending';
import {SendingPanel} from './panel';
export default async function SendingPage({params}:{params:Promise<{customerID:string}>}){
 const {customerID}=await params,i18n=await getRequestI18n();
 const data=await getNativeSending(await headers(),customerID);
 return <div className="access-page"><header className="account-heading"><h1>{i18n.t('Webdock Mail sending')}</h1><Link href={`/tenants/${customerID}/mail`}>{i18n.t('Back to Mail')}</Link></header>{data?<SendingPanel data={data}/>:<p>{i18n.t('Native Mail sending is not available yet.')}</p>}</div>;
}
