'use client';
import {useActionState} from 'react';
import {useI18n} from '@webdock/i18n/react';
import type {NativeSendingView} from '@/lib/mail-sending';
import {sendingAction} from './actions';
export function SendingPanel({data}:{data:NativeSendingView}){
 const i18n=useI18n();const [result,submit,pending]=useActionState(sendingAction,{});
 return <div className="access-page">
  <section className="auth-panel"><h2>{i18n.t('Sending connection')}</h2>
   <p>{data.transport?.state==='ready'?i18n.t('Ready'):data.transport?.state==='needs_review'?i18n.t('Operator review required'):i18n.t('Not configured')}</p>
   <form action={submit} className="access-form" aria-busy={pending}>
    <input type="hidden" name="customer" value={data.customerID}/><input type="hidden" name="action" value="configure"/>
    <label>{i18n.t('Sending connection')}<select name="mode" defaultValue={data.transport?.mode??'managed'}><option value="managed">{i18n.t('Email provided by Webdock')}</option>{data.byokAllowed && <option value="byok">{i18n.t('Own sending connection')}</option>}</select></label>
    <button className="button" disabled={pending || ['pending','needs_review'].includes(data.transport?.state??'')}>{i18n.t('Configure sending')}</button>
   </form>
   {data.apiOrigin && <p>{i18n.t('Webdock sending endpoint')}: <code>{data.apiOrigin}/v1/emails</code></p>}
  </section>
  <section className="auth-panel"><h2>{i18n.t('Webdock API keys')}</h2>
   <p className="muted">{i18n.t('These keys can send mail and check their own submissions. They cannot read mailboxes.')}</p>
   <form action={submit} className="access-form" aria-busy={pending}>
    <input type="hidden" name="customer" value={data.customerID}/><input type="hidden" name="action" value="create"/>
    <label>{i18n.t('Label')}<input name="label" required maxLength={100}/></label>
    <label>{i18n.t('Sender domain')}<select name="domainID"><option value="">{i18n.t('All verified sender domains')}</option>{data.domains.map(domain=><option key={domain.id} value={domain.id}>{domain.domain}</option>)}</select></label>
    <button className="button" disabled={pending || data.transport?.state!=='ready'}>{i18n.t('Create Webdock key')}</button>
   </form>
   {data.keys.map(key=><div key={key.id} className="panel"><strong>{key.label}</strong> <code>…{key.suffix}</code>{key.revokedAt?<p>{i18n.t('Revoked')}</p>:<form action={submit}><input type="hidden" name="customer" value={data.customerID}/><input type="hidden" name="action" value="revoke"/><input type="hidden" name="keyID" value={key.id}/><button className="button secondary" disabled={pending}>{i18n.t('Revoke key')}</button></form>}</div>)}
  </section>
  {result.token && <section className="notice" role="status"><p>{i18n.t('Save this Webdock API key now. It is shown only once.')}</p><code style={{overflowWrap:'anywhere'}}>{result.token}</code></section>}
  {result.message && <p role="status">{i18n.error(result.message,'Changes saved.')}</p>}
  {result.error && <p className="notice error" role="alert">{i18n.error(result.error)}</p>}
 </div>;
}
