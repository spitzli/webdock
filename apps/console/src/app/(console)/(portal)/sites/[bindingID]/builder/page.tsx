
import { getRequestI18n } from '@webdock/i18n/next';
import {notFound,redirect} from 'next/navigation';
import {getStudioSession} from '@/lib/studio-client';
import {demoAccess} from '@/lib/demo-bridges';
import {canvasList,canvasPage} from '@/lib/canvas-bridge';
import {CanvasEditor} from '@/components/canvas/editor';
export async function generateMetadata(){ const i18n = await getRequestI18n(); return {title: i18n.t("Site builder")}; }
export default async function Builder({params,searchParams}:{params:Promise<{bindingID:string}>;searchParams:Promise<{page?:string}>}){
  const i18n = await getRequestI18n();

 const {bindingID}=await params;const path=`/sites/${bindingID}/builder`;
 if(!(await getStudioSession()))redirect('/api/sso/login?returnTo='+encodeURIComponent(path));
 const access=await demoAccess(bindingID).catch(()=>null);if(!access?.bridge.canvas)notFound();
 const query=await searchParams;if(query.page&&!/^[1-9]\d{0,9}$/.test(query.page))notFound();
 let list, id, initialPage;
 try{
  list=await canvasList(bindingID);id=query.page?Number(query.page):list.pages[0]?.id;
  initialPage=id?await canvasPage(bindingID,id):null;
 }catch{return <section className="cms-panel"><h1>{i18n.t("Site builder")}</h1><p role="alert">{i18n.t("Could not load pages. Please try again.")}</p><a href={path}>{i18n.t("Reload")}</a></section>;}
  const readOnly=access.readOnly||access.site.role==='reader';
  return <CanvasEditor key={`${bindingID}:${id||'new'}`} bindingID={bindingID} initialList={list} initialPage={initialPage} origin={access.bridge.origin} readOnly={readOnly} canSetHomepage={!readOnly&&['operator','admin'].includes(access.site.role)}/>;

}
