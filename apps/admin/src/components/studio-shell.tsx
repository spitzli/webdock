
import { getRequestI18n } from '@webdock/i18n/next';
import Link from "next/link";
import { LanguagePicker } from "@webdock/i18n/picker";
import type { TenantPreview } from "@/lib/studio-client";
import { TenantPreviewBanner } from "./tenant-preview";
import { Navigation, Appearance, Logout, MobileMenu } from "./navigation";

export async function StudioShell({
  children,
  user,
  ssoEnabled = true,
  preview,
}: {
  children: React.ReactNode;
  user?: { name?: string | null; role?: string | null } | null;
  ssoEnabled?: boolean;
  preview?: TenantPreview;
}) {
  const i18n = await getRequestI18n();

  const operator = user?.role === "operator";
  const accountURL = new URL(
    "/account",
    process.env.WEBDOCK_AUTH_ISSUER || "https://auth.webdock.dev/api/auth",
  ).href;
  return (
    <div className="workspace">
      <a className="skip-link" href="#main">{i18n.t("Skip to content")}</a>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Link href={operator ? "/" : "/tenants"} className="brand">{i18n.t("webdock")}<span>.</span>
          </Link>
          <p className="workspace-label">
            {operator ? i18n.t("Operator studio") : i18n.t("Customer studio")}
          </p>
        </div>
        <div className="desktop-navigation">
          <Navigation operator={operator} />
          {!preview && <nav className="account-navigation" aria-label={i18n.t("Account and security")}><a href={accountURL}>{i18n.t("Account & security ↗")}</a></nav>}
          <div className="sidebar-bottom">
            <p className="operator">
              {user?.name || i18n.t("Webdock Studio")}
              <small>
                {operator ? i18n.t("Platform operator") : i18n.t("Your customer workspace")}
              </small>
            </p>
            <Appearance /><LanguagePicker className="studio-language-picker" />
            {user && <Logout ssoEnabled={ssoEnabled} />}
          </div>
        </div>
        <MobileMenu
          operator={operator}
          accountURL={preview ? undefined : accountURL}
          userName={user?.name}
          signedIn={Boolean(user)}
          ssoEnabled={ssoEnabled}
        />
      </aside>
      <div className="main-wrap">
        {preview && <TenantPreviewBanner preview={preview}/>}
        <header className="topbar">
          <span>{i18n.t("Webdock Studio")}</span>
          <div className="mobile-appearance">
            <Appearance /><LanguagePicker className="studio-language-picker" />
          </div>
          <a href="https://webdock.dev" target="_blank" rel="noreferrer">{i18n.t("Visit Webdock ↗")}</a>
        </header>
        <main id="main">{children}</main>
        <footer className="workspace-footer">{i18n.t("Webdock Studio")}<span>{i18n.t("One workspace. Independent websites.")}</span>
        </footer>
      </div>
    </div>
  );
}
