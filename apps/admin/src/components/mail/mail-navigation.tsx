'use client';
import {usePathname,useSearchParams} from 'next/navigation';
import {useI18n} from '@webdock/i18n/react';
import {AreaNavigation} from '@/components/area-navigation';
import {areaSelected,mailSendingPaths} from '@/lib/workspace-navigation';
export function MailNavigation({customerID,canManage}:{customerID:string;canManage:boolean}) {
 const i18n=useI18n(),pathname=usePathname(),query=useSearchParams(),base=`/tenants/${customerID}/mail`;
 const sending=mailSendingPaths.some(path=>areaSelected(base+path,pathname,''));
 const connection=query.get('connection');
 const pages=[{path:'/sending',label:i18n.t('Overview'),exact:true},{path:'/emails',label:i18n.t('Messages')},{path:'/analytics',label:i18n.t('Analytics')},{path:'/quickstart',label:i18n.t('Quickstart')},...(canManage?[{path:'/api-keys',label:i18n.t('API keys')},{path:'/webhooks',label:i18n.t('Webhooks')},{path:'/suppressions',label:i18n.t('Suppressions')},{path:'/logs',label:i18n.t('Request logs')}]:[])];
 const href=(path:string)=>base+path+(connection?'?connection='+encodeURIComponent(connection):'');
 const primary=[{path:'',label:i18n.t('Overview'),exact:true},{path:'/sending',label:i18n.t('Sending'),activePaths:mailSendingPaths.map(path=>base+path)},{path:'/mailboxes',label:i18n.t('Mailboxes'),activePaths:[base+'/inbox']},{path:'/domains',label:i18n.t('Sender domains')},...(canManage?[{path:'/keys',label:i18n.t('Mail credentials')},{path:'/tracking',label:i18n.t('Tracking')},{path:'/settings',label:i18n.t('Settings')}]:[])];
 return <><AreaNavigation label={i18n.t('Mail areas')} links={primary.map(page=>({href:href(page.path),label:page.label,exact:page.exact,activePaths:page.exact?undefined:[base+page.path,...(page.activePaths??[])]}))}/>{sending&&<AreaNavigation label={i18n.t('Sending tools')} links={pages.map(page=>({href:href(page.path),label:page.label,exact:page.exact,activePaths:page.exact?undefined:[base+page.path]}))}/>}</>;
}
