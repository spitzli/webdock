
import { getRequestI18n } from '@webdock/i18n/next';
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { demoAccess } from "@/lib/demo-bridges";
import { cmsHubURL, cmsModules } from "@/lib/cms-modules";

export async function generateMetadata(){ const i18n = await getRequestI18n(); return { title: i18n.t("Website management") }; }
export default async function CmsOverview({ params }: { params: Promise<{ bindingID: string }> }) {
  const i18n = await getRequestI18n();

  const { bindingID } = await params;
  const hub = cmsHubURL(bindingID);
  if (!(await auth.api.getSession({ headers: await headers() }))) redirect(`/api/sso/login?returnTo=${encodeURIComponent(hub)}`);
  const access = await demoAccess(bindingID).catch(() => null);
  if (!access) notFound();
  const modules = cmsModules(access.bridge.kind || "demo", access.site.role, access.bridge.canvas === true, access.bridge.promotions !== false, access.bridge.shop === true);
  return <div className="cms-overview">
    <header className="cms-page-heading"><div><h1>{i18n.t("Overview")}</h1><p>{i18n.t("Everything for your website in one place.")}</p></div></header>
    <div className="cms-task-overview">
      <section className="cms-module-list" aria-label={i18n.t("Manage website")}>
        <div className="cms-panel-heading"><h2>{i18n.t("What would you like to do?")}</h2><span>{modules.length}{i18n.t(" available")}</span></div>
        {modules.map(module => <Link className="cms-module-row" href={hub + module.path} key={module.id}>
          <div><h3>{i18n.t(module.id === "content" ? (access.readOnly || !module.writable ? "View content" : "Edit content") : module.id === "requests" ? "Review requests" : module.id === "calendar" ? "Manage appointments" : module.label)}</h3><p>{i18n.t(module.description)}</p></div>
          {(!module.writable || access.readOnly) && <span className="cms-role">{i18n.t("Read-only")}</span>}<span className="cms-row-chevron" aria-hidden="true">›</span>
        </Link>)}
      </section>
      {(access.bridge.kind === "shop" || access.bridge.shop === true) && <p className="cms-context-note">{i18n.t("Orders and payments on this website are simulated.")}</p>}

    </div>
  </div>;
}
