
import { getRequestI18n } from '@webdock/i18n/next';
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { accountSites } from "@/lib/access-management";
import { demoBridges } from "@/lib/demo-bridges";
import { listTenantInvitations } from "@/lib/tenants";
import { CmsSiteList } from "@/components/cms-site-list";
import { cmsSiteName } from "@/lib/cms-modules";
import "@/components/cms-workspace.css";
export async function generateMetadata(){ const i18n = await getRequestI18n(); return { title: i18n.t("Websites") }; }
export default async function Sites() {
  const i18n = await getRequestI18n();

  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect("/api/sso/login?returnTo=%2Fsites");
  const [sites, invitations] = await Promise.all([accountSites(requestHeaders), listTenantInvitations(requestHeaders)]);
  const bridges = demoBridges();
  const accountOrigin = process.env.WEBDOCK_AUTH_ISSUER || "https://auth.webdock.dev/api/auth";
  return <div className="cms-directory"><header className="cms-page-heading"><div><h1>{i18n.t("Websites")}</h1><p>{i18n.t("Choose a website to manage its content and features.")}</p></div><Link className="button secondary" href="/tenants">{i18n.t("Tenants")}</Link></header>
    {invitations.map(invitation => <article className="notice" key={invitation.id}><h2>{invitation.name}</h2><p>{i18n.t("Your invitation is waiting for acceptance.")}</p><a className="button secondary" href={new URL(`/invitation?id=${encodeURIComponent(invitation.id)}`, accountOrigin).href}>{i18n.t("Review invitation")}</a></article>)}
    {!!sites.length && <CmsSiteList sites={sites.map(site => ({ id: site.id, name: cmsSiteName(site.name), domain: new URL(site.url).hostname, role: site.role, href: bridges[site.id] ? `/sites/${site.id}` : site.url, central: !!bridges[site.id], disabled: !!session.preview && !bridges[site.id] }))} />}
    {!sites.length && <section className="auth-panel"><h2>{i18n.t("No websites assigned yet")}</h2><p>{i18n.t("Accept your invitation or ask for access to a website.")}</p><Link className="button secondary" href="/tenants">{i18n.t("View tenants")}</Link></section>}
  </div>;
}
