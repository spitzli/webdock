
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
  navigation,
}: {
  children: React.ReactNode;
  user?: { name?: string | null; role?: string | null } | null;
  ssoEnabled?: boolean;
  preview?: TenantPreview;
  navigation?: React.ReactNode;
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
          {navigation}

          <div className="sidebar-bottom">
            <p className="operator">
              {user?.name || i18n.t("Webdock Studio")}
              <small>
                {operator ? i18n.t("Platform operator") : i18n.t("Your customer workspace")}
              </small>
            </p>
            <details className="account-menu"><summary>{i18n.t("Account & preferences")}</summary>
              {!preview && <a href={accountURL}>{i18n.t("Account & security ↗")}</a>}
              <Appearance /><LanguagePicker className="studio-language-picker" />
              {user && <Logout ssoEnabled={ssoEnabled} />}
            </details>
          </div>
        </div>
        <MobileMenu
          operator={operator}
          navigation={navigation}
          accountURL={preview ? undefined : accountURL}
          userName={user?.name}
          signedIn={Boolean(user)}
          ssoEnabled={ssoEnabled}
        />
      </aside>
      <div className="main-wrap">
        {preview && <TenantPreviewBanner preview={preview}/>}
        <main id="main">{children}</main>

      </div>
    </div>
  );
}
