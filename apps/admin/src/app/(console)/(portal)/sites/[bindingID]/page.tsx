
import { getRequestI18n } from '@webdock/i18n/next';
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { demoAccess } from "@/lib/demo-bridges";
import { cmsComponents, cmsHubURL, cmsModules } from "@/lib/cms-modules";

export async function generateMetadata(){ const i18n = await getRequestI18n(); return { title: i18n.t("Website management") }; }
export default async function CmsOverview({ params }: { params: Promise<{ bindingID: string }> }) {
  const i18n = await getRequestI18n();

  const { bindingID } = await params;
  const hub = cmsHubURL(bindingID);
  if (!(await auth.api.getSession({ headers: await headers() }))) redirect(`/api/sso/login?returnTo=${encodeURIComponent(hub)}`);
  const access = await demoAccess(bindingID).catch(() => null);
  if (!access) notFound();
  const modules = cmsModules(access.bridge.kind || "demo", access.site.role, access.bridge.canvas === true, access.bridge.promotions !== false, access.bridge.shop === true);
  const components = [...new Set(modules.flatMap(module => module.components))];
  return <div className="cms-overview">
    <header className="cms-page-heading"><div><h1>{i18n.t("Overview")}</h1><p>{i18n.t("Everything for your website in one place.")}</p></div></header>
    <div className="cms-overview-grid">
      <section className="cms-panel cms-module-list" aria-label={i18n.t("Manage website")}>
        <div className="cms-panel-heading"><h2>{i18n.t("Areas")}</h2><span>{modules.length}{i18n.t(" available")}</span></div>
        {modules.map(module => <Link className="cms-module-row" href={hub + module.path} key={module.id}>
          <div><h3>{i18n.t(module.label)}</h3><p>{i18n.t(module.description)}</p></div>
          {(!module.writable || access.readOnly) && <span className="cms-role">{i18n.t("Read-only")}</span>}<span className="cms-row-chevron" aria-hidden="true">›</span>
        </Link>)}
      </section>
      <aside className="cms-overview-aside">
        <section className="cms-panel cms-info-panel"><h2>{i18n.t("Publication")}</h2><p>{(access.readOnly || access.site.role === "reader") ? i18n.t("You have read access to this website.") : i18n.t("Saved content appears immediately on the website.")}</p><a href={access.bridge.origin} target="_blank" rel="noopener noreferrer" className="cms-inline-link">{i18n.t("View website ↗")}</a></section>
        <details className="cms-panel cms-component-details"><summary>{i18n.t("Available editors ")}<span>{components.length}</span></summary><ul>{components.map(id => <li key={id}><strong>{i18n.t(cmsComponents[id].label)}</strong><span>{i18n.t(cmsComponents[id].description)}</span></li>)}</ul></details>
        {(access.bridge.kind === "shop" || access.bridge.shop === true) && <p className="cms-context-note">{i18n.t("Orders and payments on this website are simulated.")}</p>}
      </aside>
    </div>
  </div>;
}
