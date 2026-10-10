
import { getRequestI18n } from '@webdock/i18n/next';
import {headers} from 'next/headers';
import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {auth} from '@/lib/auth';
import {demoAccess} from '@/lib/demo-bridges';
import {websiteContent} from '@/lib/demo-content';
import {ContentWorkspace} from './content-editor';
import './content.css';
export async function generateMetadata(){ const i18n = await getRequestI18n(); return {title: i18n.t("Website content")}; }
export default async function ContentPage({params,searchParams}:{params:Promise<{bindingID:string}>;searchParams:Promise<{variant?:string}>}){
  const i18n = await getRequestI18n();

 const {bindingID}=await params;const variant=(await searchParams).variant||'modern';
 if(variant!=='modern'&&variant!=='old')notFound();
 if(!(await auth.api.getSession({headers:await headers()})))redirect('/api/sso/login?returnTo='+encodeURIComponent('/sites/'+bindingID+'/content'));
 const access=await demoAccess(bindingID).catch(()=>null);if(!access)notFound();
 let result;try{result=await websiteContent(bindingID,variant)}catch{return <section className="cms-panel content-empty"><h1>{i18n.t("Website content")}</h1><p role="alert">{i18n.t("Content management is currently unavailable. Please refresh later.")}</p><Link href="/sites">{i18n.t("My websites")}</Link></section>}
 const writable=!access.readOnly&&['operator','admin','editor'].includes(access.site.role);
 return <div className="content-page"><header className="cms-page-heading"><div><h1>{i18n.t("Website content")}</h1><p>{i18n.t("Select, edit and publish text and images directly.")}</p></div><a className="button secondary" href={access.bridge.origin+(variant==='old'?'/old':'/')} target="_blank" rel="noopener noreferrer">{i18n.t("Open view ↗")}</a></header>
 <ContentWorkspace key={bindingID+variant} bindingID={bindingID} fields={result.docs} variant={variant} writable={writable} origin={access.bridge.origin}/>
 </div>;
}
