import {notFound} from 'next/navigation';import Link from 'next/link';
import {TenantForm,TenantRole} from '../../../form';
import {loadMailPage,MailPageHeading,type MailPageProps} from '@/components/mail/product-page';
export default async function TeamPage(props:MailPageProps){
 const context=await loadMailPage(props,'/team');if(!context.canManage)notFound();
 const {tenant,members,invitations,operator}=context.tenantData,{i18n}=context;
 const owner=operator||tenant.member_role==='owner';
 return <div className="access-page"><MailPageHeading context={context} title={i18n.t('Team')}/>
 <p>{i18n.t('Mail uses your existing tenant team. Removing a person immediately revokes their tenant access. Tenant API keys and schedules remain active until explicitly revoked or canceled.')}</p>
 <Link href={context.base+'/api-keys'}>{i18n.t('Manage API keys')}</Link>
 {!members.some(m=>m.role==='owner'&&!m.banned&&m.emailVerified&&!m.mustChangePassword)&&<p className="notice">{i18n.t('An operator must explicitly assign the first active customer owner.')}</p>}
 <section className="auth-panel"><h2>{i18n.t('Invite a person')}</h2><TenantForm customer={context.customerID} action="invite" label={i18n.t('Send invitation')}><label className="field">{i18n.t('Name')}<input name="name" required maxLength={160}/></label><label className="field">{i18n.t('Email')}<input name="email" type="email" required maxLength={254}/></label><TenantRole/></TenantForm></section>
 <section className="auth-panel"><h2>{i18n.t('People')}</h2>{members.map(member=><article className="access-record" key={member.id}><h3>{member.name}</h3><p>{member.email} · {i18n.t(member.role==='owner'?'Owner':member.role==='admin'?'Administrator':'Member')}</p>{(owner||member.role==='member')&&<details><summary>{i18n.t('Manage membership')}</summary><TenantForm customer={context.customerID} action="role" label={i18n.t('Update tenant role')}><input type="hidden" name="member" value={member.id}/><TenantRole value={member.role} allowOwner={owner} memberOnly={!owner}/></TenantForm><TenantForm customer={context.customerID} action="remove" label={i18n.t('Remove membership')} confirm={i18n.t('Remove this person’s tenant and website access')}><input type="hidden" name="member" value={member.id}/></TenantForm></details>}</article>)}</section>
 <section className="auth-panel"><h2>{i18n.t('Invitations')}</h2>{invitations.filter(invite=>invite.status==='pending').map(invite=><article className="access-record" key={invite.id}><p>{invite.email}</p>{(['resend','cancel'] as const).map(action=><TenantForm key={action} customer={context.customerID} action={action} label={i18n.t(action==='resend'?'Resend invitation':'Cancel invitation')}><input type="hidden" name="invitation" value={invite.id}/></TenantForm>)}</article>)}</section>
 </div>;
}
