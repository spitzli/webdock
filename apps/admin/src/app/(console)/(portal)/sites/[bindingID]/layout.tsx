
import { msgid } from '@webdock/i18n';

import { getRequestI18n } from '@webdock/i18n/next';
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { demoAccess } from "@/lib/demo-bridges";
import { cmsHubURL, cmsModules, cmsRoleLabel, cmsSiteName } from "@/lib/cms-modules";
import { CmsWorkspaceNav } from "@/components/cms-workspace-nav";
import "@/components/cms-workspace.css";

export default async function CmsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ bindingID: string }> }) {
  const i18n = await getRequestI18n();

  const { bindingID } = await params;
  const hub = cmsHubURL(bindingID);
  if (!(await auth.api.getSession({ headers: await headers() }))) redirect(`/api/sso/login?returnTo=${encodeURIComponent(hub)}`);
  const access = await demoAccess(bindingID).catch(() => null);
  if (!access) notFound();
  const modules = cmsModules(access.bridge.kind || "demo", access.site.role, access.bridge.canvas === true, access.bridge.promotions !== false, access.bridge.shop === true);
  const links = [{ label: msgid("Overview"), href: hub }, ...modules.map(module => ({ label: module.label, href: hub + module.path }))];
  return <div className="cms-workspace">
    <header className="cms-workspace-header">
      <div className="cms-workspace-heading">
        <div className="cms-site-identity">
          <nav className="cms-breadcrumb" aria-label={i18n.t("Website selection")}><Link href="/sites">{i18n.t("Websites")}</Link><span aria-hidden="true">/</span><Link className="cms-workspace-title" href={hub}>{cmsSiteName(access.site.name)}</Link></nav>
          <span className="cms-site-domain">{new URL(access.bridge.origin).hostname}</span>
        </div>
        <div className="cms-workspace-actions"><span className="cms-role">{i18n.t(cmsRoleLabel(access.site.role))}</span><a className="button secondary" href={access.bridge.origin} target="_blank" rel="noopener noreferrer">{i18n.t("Open website ")}<span aria-hidden="true">↗</span></a></div>
      </div>
      <CmsWorkspaceNav links={links} />
    </header>
    <div className="cms-workspace-body">{children}</div>
  </div>;
}
