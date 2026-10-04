import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { accountSites } from "@/lib/access-management";
import { listTenantInvitations } from "@/lib/tenants";
export const metadata = { title: "My websites" };
export default async function Sites() {
  const requestHeaders = await headers();
  if (!(await auth.api.getSession({ headers: requestHeaders }))) redirect("/api/sso/login?returnTo=%2Fsites");
  const [sites, invitations] = await Promise.all([accountSites(requestHeaders), listTenantInvitations(requestHeaders)]);
  const accountOrigin = process.env.WEBDOCK_AUTH_ISSUER || "https://auth.webdock.dev/api/auth";
  return <div className="access-page"><header className="account-heading"><div><h1>My websites</h1><p className="muted">Your content, ready to edit.</p></div><Link className="button secondary" href="/tenants">My workspaces</Link></header>
    {invitations.map(invitation => <article className="notice" key={invitation.id}><h2>{invitation.name}</h2><p>Your invitation is waiting for acceptance.</p><a className="button secondary" href={new URL(`/invitation?id=${encodeURIComponent(invitation.id)}`, accountOrigin).href}>Review invitation</a></article>)}
    <div className="access-grid">{sites.map(site => <article className="access-record" key={site.id}><h2>{site.name}</h2><p className="muted">{site.role}</p><a className="button" href={site.url}>Open content manager</a></article>)}</div>
    {!sites.length && <section className="auth-panel"><h2>No websites assigned yet</h2><p>Accept your invitation or ask your workspace administrator for website access.</p><Link className="button secondary" href="/tenants">View workspaces</Link></section>}
  </div>;
}
