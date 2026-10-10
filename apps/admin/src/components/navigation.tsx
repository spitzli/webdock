"use client";
import { msgid } from '@webdock/i18n';

import { useI18n } from '@webdock/i18n/react';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
export function Navigation({ operator = true }: { operator?: boolean }) {
  const i18n = useI18n();

  const path = usePathname();
  const links = operator
    ? [
        ["/", msgid("Projects")],
        ["/customers", msgid("Customers")],
        ["/people", msgid("People & access")],
        ["/admin/plans", msgid("Plans")],
        ["/integrations", msgid("Integrations")],
        ["/infrastructure", msgid("Infrastructure")],
        ["/activity", msgid("Activity")],
        ["/admin", msgid("Settings")],
      ]
    : [
        ["/tenants", msgid("Tenants")],
        ["/sites", msgid("My websites")],
      ];
  return (
    <nav aria-label={i18n.t("Main navigation")}>
      {links.map(([href, label]) => {
        const active =
          href === "/"
            ? path === "/" || path.startsWith("/projects")
            : href === "/admin"
              ? path === "/admin"
              : href === "/customers"
                ? path.startsWith("/customers") || path.startsWith("/tenants")
                : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
          >
            {i18n.t(label)}
          </Link>
        );
      })}
    </nav>
  );
}
export function MobileMenu({
  operator,
  accountURL,
  userName,
  signedIn,
  ssoEnabled,
}: {
  operator: boolean;
  accountURL?: string;
  userName?: string | null;
  signedIn: boolean;
  ssoEnabled: boolean;
}) {
  const i18n = useI18n();

  return (
    <div className="mobile-menu-wrap">
      <Link className="brand mobile-brand" href={operator ? "/" : "/tenants"}>{i18n.t("webdock")}<span>.</span>
      </Link>
      <details
        className="mobile-menu"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a"))
            event.currentTarget.removeAttribute("open");
        }}
      >
        <summary>{i18n.t("Menu ")}<span aria-hidden="true">☰</span>
        </summary>
        <div className="mobile-menu-content">
          <Navigation operator={operator} />
          {accountURL && <nav className="account-navigation" aria-label={i18n.t("Account and security")}><a href={accountURL}>{i18n.t("Account & security ↗")}</a></nav>}
          <div className="mobile-menu-account">
            <span>{userName || i18n.t("Webdock Studio")}</span>
            {signedIn && <Logout ssoEnabled={ssoEnabled} />}
          </div>
        </div>
      </details>
    </div>
  );
}
export function TenantNavigation({ customerID, canManage = false, preview = false }: { customerID: string; canManage?: boolean; preview?: boolean }) {
  const i18n = useI18n();

  const path = usePathname();
  const base = `/tenants/${encodeURIComponent(customerID)}`;
  return (
    <nav className="tenant-navigation" aria-label={i18n.t("Tenant navigation")}>
      {[
        [base, msgid("Overview")],
        [base + "/usage", msgid("Plan & usage")],
        [base + "/hosting", msgid("Hosting")],
        ...(!preview ? [[base + "/databases", msgid("Databases")]] : []),
        ...(!preview ? [[base + "/mail", msgid("Mail")]] : []),
        ...(canManage ? [[base + "/mail/keys", msgid("Credentials")], [base + "/mail/tracking", msgid("Tracking")]] : []),
      ].map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={path === href || (href === base + "/databases" && path.startsWith(href + "/")) ? "page" : undefined}
        >
          {i18n.t(label)}
        </Link>
      ))}
    </nav>
  );
}
const subscribeTheme = (notify: () => void) => {
  window.addEventListener("webdock-theme", notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener("webdock-theme", notify);
    window.removeEventListener("storage", notify);
  };
};
export function Appearance() {
  const i18n = useI18n();

  const theme = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.dataset.theme || "system",
    () => "system",
  );
  return (
    <label className="appearance">{i18n.t("Appearance")}<select
        aria-label={i18n.t("Appearance")}
        value={theme}
        onChange={(e) => {
          const value = e.target.value;
          if (value === "system") delete document.documentElement.dataset.theme;
          else document.documentElement.dataset.theme = value;
          try {
            localStorage.setItem("webdock-theme", value);
          } catch {}
          window.dispatchEvent(new Event("webdock-theme"));
        }}
      >
        <option value="system">{i18n.t("System")}</option>
        <option value="light">{i18n.t("Light")}</option>
        <option value="dark">{i18n.t("Dark")}</option>
      </select>
    </label>
  );
}
export function Logout({ ssoEnabled = false }: { ssoEnabled?: boolean }) {
  const i18n = useI18n();

  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (ssoEnabled)
    return (
      <form action="/api/sso/logout" method="post">
        <button className="text-button" type="submit">{i18n.t("Sign out")}</button>
      </form>
    );
  return (
    <>
      <button
        className="text-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/api/users/logout", { method: "POST" });
            if (!r.ok) throw Error();
            router.replace("/login");
            router.refresh();
          } catch {
            setBusy(false);
            setError(true);
          }
        }}
      >{i18n.t("Sign out")}</button>
      {error && <small role="alert">{i18n.t("Sign out failed. Please retry.")}</small>}
    </>
  );
}
