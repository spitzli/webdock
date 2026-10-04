import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTenant, profileFields } from "@/lib/tenants";
import { AccessError } from "@/lib/access-management";
import { TenantForm, TenantRole } from "../form";
export const metadata = { title: "Tenant details" };
export default async function Tenant({ params }: { params: Promise<{ customerID: string }> }) {
  const { customerID } = await params, requestHeaders = await headers();
  if (!(await auth.api.getSession({ headers: requestHeaders }))) redirect("/sign-in");
  let data;
  try { data = await getTenant(requestHeaders, customerID); }
  catch (error) { if (error instanceof AccessError) notFound(); throw error; }
  const { tenant, canManage, operator, sites, members, invitations } = data;
  return <div className="access-page">
    <header className="account-heading"><div><h1>{tenant.name}</h1><p className="muted">{tenant.status === "active" ? "Customer profile and tenant access" : "Archived tenant — changes disabled"}</p></div><Link className="button secondary" href="/tenants">All tenants</Link></header>
    <p><Link className="button secondary" href={`/tenants/${customerID}/mail`}>Mail</Link>{" "}<Link className="button secondary" href={`/tenants/${customerID}/usage`}>Plan and usage</Link></p>
    <div className="access-grid"><section className="auth-panel"><h2>Customer profile</h2>
      {canManage ? <TenantForm customer={customerID} action="profile" label="Save profile">
        <label className="field">Customer type<select name="customer_type" defaultValue={tenant.customer_type}><option value="person">Person</option><option value="company">Company</option></select></label>
        {profileFields.map(([field, label, max]) => <label className="field" key={field}>{label}<input name={field} defaultValue={tenant[field] || ""} required={field === "name"} maxLength={max} type={field === "contact_email" ? "email" : field === "phone" ? "tel" : "text"} /></label>)}
        <p className="help">Contact details do not change anyone’s sign-in email or permissions.</p>
      </TenantForm> : <dl><dt>Customer type</dt><dd>{tenant.customer_type === "company" ? "Company" : "Person"}</dd>{profileFields.map(([field, label]) => <div key={field}><dt>{label}</dt><dd>{tenant[field] || "—"}</dd></div>)}</dl>}
    </section><section className="auth-panel"><h2>Your websites</h2><p className="muted">Website permissions are assigned separately by your Webdock operator.</p>
      {sites.length ? sites.map((site) => <article className="access-record" key={site.id}><h3><a href={site.url}>{site.name}</a></h3><p>{site.role}</p></article>) : <p>No websites are currently authorized for your account in this tenant.</p>}
      {operator && <p><Link href="/people">Manage website permissions</Link></p>}
    </section></div>
    {canManage && <>
      <section className="account-section"><h2>Invite a person</h2><p>New people receive a secure link to choose their password. Tenant access starts after they accept the invitation.</p>
        <TenantForm customer={customerID} action="invite" label="Send invitation"><label className="field">Name<input name="name" required maxLength={160} /></label><label className="field">Email<input name="email" type="email" required maxLength={254} /></label><TenantRole value={operator && members.length === 0 ? "admin" : "member"} /></TenantForm>
      </section>
      <section className="account-section"><h2>People</h2><p className="muted">Administrators can edit this profile and invite people. Existing role changes and removals are managed by your Webdock operator.</p><div className="access-grid">
        {members.map((member) => <article className="access-record" key={member.id}><h3>{member.name}</h3><p>{member.email}<br />{member.role} · {member.banned ? "Suspended" : !member.emailVerified || member.mustChangePassword ? "Setup pending" : "Active"}</p>
          {operator && <><TenantForm customer={customerID} action="role" label="Update tenant role"><input type="hidden" name="member" value={member.id} /><TenantRole value={member.role} /></TenantForm><TenantForm customer={customerID} action="remove" label="Remove membership" confirm="Remove this person’s tenant and website access"><input type="hidden" name="member" value={member.id} /></TenantForm></>}
        </article>)}
      </div>{!members.length && <p>No customer members yet. Invite the first person with the Administrator role.</p>}</section>
      <section className="account-section"><h2>Invitations</h2>{invitations.map((invite) => <article className="access-record" key={invite.id}><h3>{invite.email}</h3><p>{invite.role} · {invite.status === "pending" && new Date(invite.expiresAt) < new Date() ? "Expired" : invite.status}</p>
        {invite.status === "pending" && <><TenantForm customer={customerID} action="resend" label="Resend invitation"><input type="hidden" name="invitation" value={invite.id} /></TenantForm><TenantForm customer={customerID} action="cancel" label="Cancel invitation" confirm="Cancel the invitation and pending website access"><input type="hidden" name="invitation" value={invite.id} /></TenantForm></>}
      </article>)}{!invitations.length && <p>No invitations yet.</p>}</section>
    </>}
  </div>;
}
