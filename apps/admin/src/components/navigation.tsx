"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
export function Navigation({ operator = true }: { operator?: boolean }) {
  const path = usePathname();
  const links = operator
    ? [
        ["/", "Projects"],
        ["/customers", "Customers"],
        ["/people", "People & access"],
        ["/admin/plans", "Plans"],
        ["/integrations", "Integrations"],
        ["/activity", "Activity"],
        ["/admin", "Settings"],
      ]
    : [
        ["/tenants", "Tenants"],
        ["/sites", "My websites"],
      ];
  return (
    <nav aria-label="Main navigation">
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
            {label}
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
  accountURL: string;
  userName?: string | null;
  signedIn: boolean;
  ssoEnabled: boolean;
}) {
  return (
    <div className="mobile-menu-wrap">
      <Link className="brand mobile-brand" href={operator ? "/" : "/tenants"}>
        webdock<span>.</span>
      </Link>
      <details
        className="mobile-menu"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a"))
            event.currentTarget.removeAttribute("open");
        }}
      >
        <summary>
          Menu <span aria-hidden="true">☰</span>
        </summary>
        <div className="mobile-menu-content">
          <Navigation operator={operator} />
          <nav className="account-navigation" aria-label="Account and security">
            <a href={accountURL}>Account &amp; security ↗</a>
          </nav>
          <div className="mobile-menu-account">
            <span>{userName || "Webdock Studio"}</span>
            {signedIn && <Logout ssoEnabled={ssoEnabled} />}
          </div>
        </div>
      </details>
    </div>
  );
}
export function TenantNavigation({ customerID, canManage = false }: { customerID: string; canManage?: boolean }) {
  const path = usePathname();
  const base = `/tenants/${encodeURIComponent(customerID)}`;
  return (
    <nav className="tenant-navigation" aria-label="Tenant navigation">
      {[
        [base, "Overview"],
        [base + "/usage", "Plan & usage"],
        [base + "/mail", "Mail"],
        ...(canManage ? [[base + "/mail/keys", "Credentials"], [base + "/mail/tracking", "Tracking"]] : []),
      ].map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={path === href ? "page" : undefined}
        >
          {label}
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
  const theme = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.dataset.theme || "system",
    () => "system",
  );
  return (
    <label className="appearance">
      Appearance
      <select
        aria-label="Appearance"
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
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
export function Logout({ ssoEnabled = false }: { ssoEnabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (ssoEnabled)
    return (
      <form action="/api/sso/logout" method="post">
        <button className="text-button" type="submit">
          Sign out
        </button>
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
      >
        Sign out
      </button>
      {error && <small role="alert">Sign out failed. Please retry.</small>}
    </>
  );
}
