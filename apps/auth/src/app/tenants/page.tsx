import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listTenants, listTenantInvitations } from "@/lib/tenants";
import { AccessError } from "@/lib/access-management";
export const metadata = { title: "Your tenants" };
export default async function Tenants() {
  const requestHeaders = await headers();
  if (!(await auth.api.getSession({ headers: requestHeaders }))) redirect("/sign-in");
  let tenants, invitations;
  try { [tenants, invitations] = await Promise.all([listTenants(requestHeaders), listTenantInvitations(requestHeaders)]); }
  catch (error) { if (error instanceof AccessError) redirect("/account"); throw error; }
  return <div className="access-page">
    <header className="account-heading"><div><h1>Your tenants</h1><p className="muted">Customer details, people and assigned websites.</p></div><Link className="button secondary" href="/account">My account</Link></header>
    {invitations.map(invite => <article className="access-record" key={invite.id}><h2>Invitation to {invite.name}</h2><p className="muted">Tenant role: {invite.role}</p><Link className="button" href={`/invitation?id=${encodeURIComponent(invite.id)}`}>Review invitation</Link></article>)}
    <div className="access-grid">{tenants.map((tenant) => <article className="access-record" key={tenant.id}><h2><Link href={`/tenants/${tenant.id}`}>{tenant.name}</Link></h2><p className="muted">{tenant.status === "active" ? tenant.role || "Platform operator" : "Archived"}</p></article>)}</div>
    {!tenants.length && <p>No active tenant memberships yet. Accept your emailed invitation to get started.</p>}
    <p><Link href="/sites">My websites</Link></p>
  </div>;
}
