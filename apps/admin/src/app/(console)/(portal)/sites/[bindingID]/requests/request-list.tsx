'use client';
import {useOramaRows} from "@webdock/search/react";
import { msgid } from '@webdock/i18n';

import { useI18n } from '@webdock/i18n/react';

import {useCallback,useEffect,useState} from 'react';
import type {DemoRequest} from '@/lib/demo-bridges';
import {RequestForm} from './request-form';
const types:Record<string,string>={appointment:msgid("Appointment"),reservation:msgid("Reservation"),event:msgid("Event"),preorder:msgid("Preorder"),voucher:msgid("Voucher"),application:msgid("Application")};
const statuses:Record<string,string>={pending:msgid("Pending"),reviewed:msgid("Reviewed"),archived:msgid("Archived")};
const fields:Record<string,string>={name:msgid("Name"),email:msgid("Email"),phone:msgid("Phone"),date:msgid("Date"),time:msgid("Time"),people:msgid("People"),message:msgid("Message"),service:msgid("Service"),amount:msgid("Amount")};
export function RequestList({bindingID,requests,canWrite}:{bindingID:string;requests:DemoRequest[];canWrite:boolean}){
  const i18n = useI18n();

 const [status,setStatus]=useState('all'),[search,setSearch]=useState(''),[dirty,setDirty]=useState<Record<number,boolean>>({});
 const onDirty=useCallback((id:number,value:boolean)=>setDirty(old=>old[id]===value?old:{...old,[id]:value}),[]);
 const hasDirty=Object.values(dirty).some(Boolean);
 useEffect(()=>{
  if(!hasDirty)return;
  const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};
  const navigate=(event:MouseEvent)=>{const link=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('a[href]'):null;if(link&&!event.defaultPrevented&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&(!link.target||link.target==='_self')&&!link.hasAttribute('download')&&new URL(link.href).href.split('#')[0]!==window.location.href.split('#')[0]&&!window.confirm(i18n.t("Discard unsaved request changes?"))){event.preventDefault();event.stopPropagation()}};
  window.addEventListener('beforeunload',unload);document.addEventListener('click',navigate,true);
  return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',navigate,true)};
 },[hasDirty,i18n]);
 const matching=useOramaRows(requests,search,r=>`${i18n.t(types[r.feature]||r.feature)} ${r.id} ${Object.values(r.data).join(' ')}`);
 const matchingIDs=new Set(matching.map(r=>r.id));
 const matches=(r:DemoRequest)=>!!dirty[r.id]||((status==='all'||r.status===status)&&matchingIDs.has(r.id));
 const visible=requests.filter(matches).length;
 return <section className="cms-panel request-list"><div className="request-toolbar"><label className="request-search"><span className="request-sr-only">{i18n.t("Search requests on this page")}</span><input type="search" placeholder={i18n.t("Search requests on this page")} value={search} onChange={e=>setSearch(e.target.value)}/></label><label className="request-status-filter"><span className="request-sr-only">{i18n.t("Status on this page")}</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">{i18n.t("All statuses")}</option>{Object.entries(statuses).map(([value,label])=><option key={value} value={value}>{i18n.t(label)}</option>)}</select></label></div><div className="request-list-caption"><span>{visible}{i18n.t(" of ")}{requests.length}{i18n.t(" on this page")}</span>{hasDirty&&<span role="status">{i18n.t("Unsaved requests remain visible")}</span>}</div>
 {!visible&&<p className="request-empty">{requests.length?i18n.t("No matching requests on this page."):i18n.t("No requests yet. New requests appear here.")}</p>}
 {requests.map(request=><details className="request-record" key={request.id} hidden={!matches(request)}><summary><span className="request-summary-main"><strong>{String(request.data.name||i18n.t(types[request.feature]||request.feature))}</strong><span>{i18n.t(types[request.feature]||request.feature)} <span className="request-id">#{request.id}</span>{request.data.date?` · ${i18n.date(String(request.data.date),{dateStyle:"medium"})}`:''}{request.data.time?` ${request.data.time}`:''}</span></span><span className="request-summary-side"><span className={'request-status '+request.status}>{i18n.t(statuses[request.status]||request.status)}</span><time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleDateString(i18n.locale === "de" ? "de-DE" : "en-GB",{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit'})}</time>{dirty[request.id]&&<span className="request-dirty">{i18n.t("Unsaved")}</span>}</span><span className="request-chevron" aria-hidden="true">⌄</span></summary><div className="request-details"><dl>{Object.entries(request.data).map(([key,value])=><div className={['message','email'].includes(key)?'request-message':''} key={key}><dt>{i18n.t(fields[key]||key)}</dt><dd>{String(value)}</dd></div>)}</dl><p className="request-received">{i18n.t("Received on ")}{new Date(request.createdAt).toLocaleString(i18n.locale === "de" ? "de-DE" : "en-GB",{timeZone:'Europe/Berlin'})}</p>
 {canWrite?<RequestForm bindingID={bindingID} {...request} onDirty={onDirty}/>:<div className="request-readonly"><span>{i18n.t("Internal note")}</span><p>{request.internalNote||i18n.t("No note.")}</p></div>}
 </div></details>)}
 </section>;
}
