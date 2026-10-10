'use client';
import { useI18n } from '@webdock/i18n/react';

import {useActionState,useEffect,useState} from 'react';
import {updateRequest} from './actions';
export function RequestForm({bindingID,id,status,internalNote,updatedAt,onDirty}:{bindingID:string;id:number;status:string;internalNote:string|null;updatedAt:string;onDirty:(id:number,dirty:boolean)=>void}){
  const i18n = useI18n();

 const [draftStatus,setStatus]=useState(status),[note,setNote]=useState(internalNote||''),[saved,setSaved]=useState({status,note:internalNote||''}),[version,setVersion]=useState(updatedAt);
 const dirty=draftStatus!==saved.status||note!==saved.note;
 const [state,action,pending]=useActionState(async(previous:{message?:string;error?:string},form:FormData)=>{
  const result=await updateRequest(previous,form);
  if(result.message)setSaved({status:String(form.get('status')),note:String(form.get('internalNote')||'')});
  return result;
 },{});
 useEffect(()=>{onDirty(id,dirty)},[id,dirty,onDirty]);
 if(!dirty&&version!==updatedAt){setStatus(status);setNote(internalNote||'');setSaved({status,note:internalNote||''});setVersion(updatedAt)}
 return <form action={action} className="request-form"><input type="hidden" name="bindingID" value={bindingID}/><input type="hidden" name="id" value={id}/><input type="hidden" name="updatedAt" value={version}/>
  <fieldset disabled={pending}><label>{i18n.t("Status")}<select name="status" value={draftStatus} onChange={e=>setStatus(e.target.value)}><option value="pending">{i18n.t("Pending")}</option><option value="reviewed">{i18n.t("Reviewed")}</option><option value="archived">{i18n.t("Archived")}</option></select></label><label>{i18n.t("Internal note")}<textarea name="internalNote" maxLength={3000} value={note} onChange={e=>setNote(e.target.value)} rows={3} placeholder={i18n.t("Note for follow-up")}/></label></fieldset>
  <div className="cms-savebar request-savebar"><div>{state.error?<p className="request-feedback error" role="alert">{i18n.error(state.error)}</p>:dirty?<span role="status">{i18n.t("Unsaved changes")}</span>:state.message?<p className="request-feedback success" role="status">{i18n.error(state.message, "Changes saved.")}</p>:null}</div><button className="button" disabled={pending||!dirty}>{pending?i18n.t("Saving…"):i18n.t("Save request")}</button></div>
 </form>;
}
