"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
export function Navigation() {
  const path = usePathname();
  return (
    <nav aria-label="Main navigation">
      {[
        ["/", "Projects"],
        ["/customers", "Customers"],
        ["/activity", "Activity"],
        ["/integrations", "Integrations"],
      ].map(([href, label]) => (
        <Link
          aria-current={
            href === "/"
              ? path === "/" || path.startsWith("/projects")
                ? "page"
                : undefined
              : path.startsWith(href)
                ? "page"
                : undefined
          }
          key={href}
          href={href}
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
