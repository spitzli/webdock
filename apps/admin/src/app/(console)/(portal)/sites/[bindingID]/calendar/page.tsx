
import { getRequestI18n } from '@webdock/i18n/next';
import {headers} from 'next/headers';
import {notFound,redirect} from 'next/navigation';
import Link from 'next/link';
import {auth} from '@/lib/auth';
import {demoAccess,demoCalendarRequest} from '@/lib/demo-bridges';
import {CalendarEditor,AppointmentForm,CancelAppointment} from './calendar-editor';
import './calendar.css';
export async function generateMetadata(){ const i18n = await getRequestI18n(); return {title: i18n.t("Opening hours & appointments")}; }
export default async function Calendar({params,searchParams}:{params:Promise<{bindingID:string}>;searchParams:Promise<{page?:string}>}){
  const i18n = await getRequestI18n();

 const {bindingID}=await params;
 if(!(await auth.api.getSession({headers:await headers()})))redirect('/api/sso/login?returnTo='+encodeURIComponent('/sites/'+bindingID+'/calendar'));
 const access=await demoAccess(bindingID).catch(()=>null);if(!access)notFound();
 const pageText=(await searchParams).page||'1';if(!/^[1-9][0-9]{0,3}$/.test(pageText))notFound();const page=Number(pageText);
 let data;try{data=await demoCalendarRequest(bindingID,undefined,page)}catch{return <section className="cms-panel"><h1>{i18n.t("Opening hours & appointments")}</h1><p role="alert">{i18n.t("The calendar is currently unavailable. Please refresh later.")}</p><Link href={'/sites/'+bindingID+'/requests'}>{i18n.t("View requests")}</Link></section>}
 const writable=!access.readOnly&&['operator','admin','editor'].includes(access.site.role);
 return <div className="calendar-page"><header className="cms-page-heading"><div><h1>{i18n.t("Opening hours & appointments")}</h1><p className="muted">{i18n.t("Manage weekly hours, exceptions and occupied times.")}</p></div></header>
 <CalendarEditor bindingID={bindingID} settings={data.settings} updatedAt={data.updatedAt} writable={writable}/>
 {writable&&<AppointmentForm bindingID={bindingID} slotMinutes={data.settings.slotMinutes}/>}
 <section className="cms-panel"><div className="calendar-section-heading"><h2>{i18n.t("Bookings")}</h2><span className="calendar-meta">{data.appointments.length}{i18n.t(" on this page")}</span></div>{data.appointments.length===0&&<p className="calendar-empty">{i18n.t("No appointments yet. New entries appear here.")}</p>}
 <div className="calendar-bookings">{data.appointments.map(a=><article className="calendar-booking" key={a.id}><div className="calendar-booking-date"><strong>{i18n.date(a.date,{dateStyle:"medium"})}</strong><span>{a.time}{i18n.t(" hrs")}</span></div><div className="calendar-booking-name"><strong>{a.label}</strong><p>{a.durationMinutes}{i18n.t(" min · ")}{i18n.n("{count} place", "{count} places",a.units)}{a.requestID?i18n.t(" · Request #{id}",{id:a.requestID}):''}</p></div><div className="calendar-booking-actions"><span className={'calendar-status'+(a.status==='active'?'':' cancelled')}>{a.status==='active'?i18n.t("Occupied"):i18n.t("Cancelled")}</span>{writable&&a.status==='active'&&<CancelAppointment bindingID={bindingID} appointment={a}/>}</div></article>)}</div><nav aria-label={i18n.t("Appointment pages")} className="calendar-pagination">{page>1&&<Link className="button secondary" href={"?page="+(page-1)}>{i18n.t("Back")}</Link>}<span>{i18n.t("Page ")}{page}</span>{data.hasMoreAppointments&&<Link className="button secondary" href={"?page="+(page+1)}>{i18n.t("Next")}</Link>}</nav></section></div>;
}
