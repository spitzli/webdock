'use client';
import { msgid } from '@webdock/i18n';

import { useI18n } from '@webdock/i18n/react';

import {useActionState,useEffect,useState} from 'react';
import type {CalendarSettings,CalendarWindow,DemoAppointment} from '@/lib/demo-bridges';
import {changeCalendar} from './actions';
const weekdays=[msgid("Sunday"),msgid("Monday"),msgid("Tuesday"),msgid("Wednesday"),msgid("Thursday"),msgid("Friday"),msgid("Saturday")];
function leavingPage(event:MouseEvent){
 const link=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('a[href]'):null;
 return link&&!event.defaultPrevented&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&(!link.target||link.target==='_self')&&!link.hasAttribute('download')&&new URL(link.href).href.split('#')[0]!==window.location.href.split('#')[0];
}
function Feedback({state}:{state:{message?:string;error?:string}}){
  const i18n = useI18n();
return <>{state.error&&<p role="alert" className="calendar-feedback error">{i18n.error(state.error)}</p>}{state.message&&<p role="status" className="calendar-feedback success">{i18n.error(state.message, "Changes saved.")}</p>}</>}
function Windows({windows,onChange,label}:{windows:CalendarWindow[];onChange:(windows:CalendarWindow[])=>void;label:string}){
  const i18n = useI18n();

 return <div className="calendar-windows">{windows.map((w,i)=><div className="calendar-window" key={i}><input type="time" required aria-label={i18n.t("{label}: start {number}",{label,number:i+1})} value={w.start} onChange={e=>onChange(windows.map((v,j)=>j===i?{...v,start:e.target.value}:v))}/><span aria-hidden="true">–</span><input type="time" required aria-label={i18n.t("{label}: end {number}",{label,number:i+1})} value={w.end} onChange={e=>onChange(windows.map((v,j)=>j===i?{...v,end:e.target.value}:v))}/><button type="button" className="calendar-icon-button" aria-label={i18n.t("{label}: remove time slot {number}",{label,number:i+1})} onClick={()=>onChange(windows.filter((_,j)=>i!==j))}>×</button></div>)}{windows.length<2&&<button type="button" className="calendar-text-button" onClick={()=>onChange([...windows,{start:windows.length?'18:00':'09:00',end:windows.length?'20:00':'17:00'}])}>{windows.length?i18n.t("+ Time slot"):i18n.t("+ Opening time")}</button>}</div>;
}
export function CalendarEditor({bindingID,settings,updatedAt,writable}:{bindingID:string;settings:CalendarSettings;updatedAt:string;writable:boolean}){
  const i18n = useI18n();

 const [draft,setDraft]=useState(settings),[saved,setSaved]=useState(JSON.stringify(settings)),[version,setVersion]=useState(updatedAt);
 const dirty=JSON.stringify(draft)!==saved;
 const [state,action,pending]=useActionState(async(previous:{error?:string;message?:string},form:FormData)=>{
  const result=await changeCalendar(previous,form);
  if(result.message)setSaved(String(form.get('settings')));
  return result;
 },{});
 if(!dirty&&version!==updatedAt){setDraft(settings);setSaved(JSON.stringify(settings));setVersion(updatedAt)}
 useEffect(()=>{
  if(!dirty)return;
  const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};
  const navigate=(event:MouseEvent)=>{if(leavingPage(event)&&!window.confirm(i18n.t("Discard unsaved opening hours?"))){event.preventDefault();event.stopPropagation()}};
  window.addEventListener('beforeunload',unload);document.addEventListener('click',navigate,true);
  return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',navigate,true)};
 },[dirty,i18n]);
 return <section className="cms-panel calendar-editor"><div className="calendar-section-heading"><h2>{i18n.t("Weekly schedule")}</h2><span className="calendar-meta">{i18n.t("Europe/Berlin")}</span></div><form action={action} className="calendar-form"><input type="hidden" name="bindingID" value={bindingID}/><input type="hidden" name="action" value="settings"/><input type="hidden" name="updatedAt" value={version}/><input type="hidden" name="settings" value={JSON.stringify(draft)}/>
 <fieldset disabled={!writable||pending} className="calendar-fieldset"><div className="calendar-config"><label>{i18n.t("Appointment duration")}<select value={draft.slotMinutes} onChange={e=>setDraft({...draft,slotMinutes:Number(e.target.value) as 15|30|60})}><option value={15}>{i18n.t("15 minutes")}</option><option value={30}>{i18n.t("30 minutes")}</option><option value={60}>{i18n.t("60 minutes")}</option></select></label><label>{i18n.t("Places per appointment")}<input type="number" min={1} max={100} required value={draft.capacity} onChange={e=>setDraft({...draft,capacity:Number(e.target.value)})}/></label></div>
 <div className="calendar-week">{[1,2,3,4,5,6,0].map(day=><div className="calendar-day" key={day}><strong>{i18n.t(weekdays[day])}</strong><label className="calendar-closed"><input type="checkbox" checked={draft.weekly[day].length===0} onChange={e=>setDraft({...draft,weekly:draft.weekly.map((w,i)=>i===day?(e.target.checked?[]:[{start:'09:00',end:'17:00'}]):w)})}/>{i18n.t("Closed")}</label><Windows label={i18n.t(weekdays[day])} windows={draft.weekly[day]} onChange={windows=>setDraft({...draft,weekly:draft.weekly.map((w,i)=>i===day?windows:w)})}/></div>)}</div>
 <div className="calendar-section-heading calendar-exceptions-heading"><div><h3>{i18n.t("Exceptions")}</h3><p>{i18n.t("Replace the weekly schedule on the selected date.")}</p></div><button className="button secondary" type="button" onClick={()=>setDraft({...draft,overrides:[...draft.overrides,{date:'',closed:true,windows:[]}]})}>{i18n.t("+ Exception")}</button></div>
 {!draft.overrides.length&&<p className="calendar-empty">{i18n.t("No exceptions. Weekly opening hours apply.")}</p>}
 {draft.overrides.map((o,i)=><div className="calendar-exception" key={i}><div className="calendar-exception-controls"><label>{i18n.t("Date")}<input type="date" required value={o.date} onChange={e=>setDraft({...draft,overrides:draft.overrides.map((v,j)=>i===j?{...v,date:e.target.value}:v)})}/></label><label className="calendar-closed"><input type="checkbox" checked={o.closed} onChange={e=>setDraft({...draft,overrides:draft.overrides.map((v,j)=>i===j?{...v,closed:e.target.checked,windows:e.target.checked?[]:[{start:'09:00',end:'17:00'}]}:v)})}/>{i18n.t("Closed")}</label><button className="calendar-text-button" type="button" aria-label={i18n.t("Remove exception {date}",{date:o.date||i+1})} onClick={()=>setDraft({...draft,overrides:draft.overrides.filter((_,j)=>i!==j)})}>{i18n.t("Remove")}</button></div>{!o.closed&&<Windows label={i18n.t("Exception {date}",{date:o.date||i+1})} windows={o.windows} onChange={windows=>setDraft({...draft,overrides:draft.overrides.map((v,j)=>i===j?{...v,windows}:v)})}/>}</div>)}
 </fieldset><div className="cms-savebar calendar-savebar"><div>{state.error?<Feedback state={{error:state.error}}/>:dirty?<span role="status">{i18n.t("Unsaved changes")}</span>:<Feedback state={state}/>}</div>{writable&&<button className="button" disabled={pending||!dirty}>{pending?i18n.t("Saving…"):i18n.t("Save opening hours")}</button>}</div></form></section>;
}
export function AppointmentForm({bindingID,slotMinutes}:{bindingID:string;slotMinutes:number}){
  const i18n = useI18n();

 const empty={date:'',time:'',durationMinutes:String(slotMinutes),units:'1',label:''};
 const [draft,setDraft]=useState(empty),[dirty,setDirty]=useState(false);
 const [state,action,pending]=useActionState(async(previous:{error?:string;message?:string},form:FormData)=>{const result=await changeCalendar(previous,form);if(result.message){setDraft(empty);setDirty(false)}return result},{});
 const edit=(key:keyof typeof draft,value:string)=>{setDraft({...draft,[key]:value});setDirty(true)};
 useEffect(()=>{if(!dirty)return;const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};const navigate=(event:MouseEvent)=>{if(leavingPage(event)&&!window.confirm(i18n.t("Discard unsaved appointment?"))){event.preventDefault();event.stopPropagation()}};window.addEventListener('beforeunload',unload);document.addEventListener('click',navigate,true);return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',navigate,true)}},[dirty,i18n]);
 return <details className="cms-panel calendar-create"><summary>{i18n.t("Add appointment ")}<span aria-hidden="true">+</span></summary><div className="calendar-create-body"><p className="calendar-meta">{i18n.t("Reserves time and capacity in the calendar.")}</p><form action={action} className="calendar-form"><input type="hidden" name="bindingID" value={bindingID}/><input type="hidden" name="action" value="create"/><fieldset className="calendar-fieldset calendar-appointment-fields" disabled={pending}><label>{i18n.t("Date")}<input name="date" type="date" value={draft.date} onChange={e=>edit('date',e.target.value)} required/></label><label>{i18n.t("Start")}<input name="time" type="time" value={draft.time} onChange={e=>edit('time',e.target.value)} required/></label><label>{i18n.t("Duration (minutes)")}<input name="durationMinutes" type="number" min={15} max={480} step={15} value={draft.durationMinutes} onChange={e=>edit('durationMinutes',e.target.value)} required/></label><label>{i18n.t("Places occupied")}<input name="units" type="number" min={1} max={100} value={draft.units} onChange={e=>edit('units',e.target.value)} required/></label><label className="calendar-label-field">{i18n.t("Label")}<input name="label" maxLength={100} placeholder={i18n.t("e.g. Consultation")} value={draft.label} onChange={e=>edit('label',e.target.value)} required/></label></fieldset><div className="cms-savebar calendar-savebar"><div>{state.error?<Feedback state={{error:state.error}}/>:dirty?<span role="status">{i18n.t("Unsaved appointment")}</span>:<Feedback state={state}/>}</div><button className="button" disabled={pending}>{pending?i18n.t("Saving…"):i18n.t("Add appointment")}</button></div></form></div></details>;
}
export function CancelAppointment({bindingID,appointment}:{bindingID:string;appointment:DemoAppointment}){
  const i18n = useI18n();

 const [state,action,pending]=useActionState(changeCalendar,{});
 return <form action={action} className="calendar-cancel"><input type="hidden" name="bindingID" value={bindingID}/><input type="hidden" name="action" value="cancel"/><input type="hidden" name="id" value={appointment.id}/><input type="hidden" name="updatedAt" value={appointment.updatedAt}/><button className="calendar-text-button" disabled={pending}>{pending?i18n.t("Cancelling…"):i18n.t("Cancel appointment")}</button><Feedback state={state}/></form>;
}
