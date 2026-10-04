import Link from "next/link";
import { Navigation, Appearance, Logout, MobileMenu } from "./navigation";

export function StudioShell({
  children,
  user,
  ssoEnabled = true,
}: {
  children: React.ReactNode;
  user?: { name?: string | null; role?: string | null } | null;
  ssoEnabled?: boolean;
}) {
  const operator = user?.role === "operator";
  const accountURL = new URL(
    "/account",
    process.env.WEBDOCK_AUTH_ISSUER || "https://auth.webdock.dev/api/auth",
  ).href;
  return (
    <div className="workspace">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Link href={operator ? "/" : "/tenants"} className="brand">
            webdock<span>.</span>
          </Link>
          <p className="workspace-label">
            {operator ? "Operator studio" : "Customer studio"}
          </p>
        </div>
        <div className="desktop-navigation">
          <Navigation operator={operator} />
          <nav className="account-navigation" aria-label="Account and security">
            <a href={accountURL}>Account &amp; security ↗</a>
          </nav>
          <div className="sidebar-bottom">
            <p className="operator">
              {user?.name || "Webdock Studio"}
              <small>
                {operator ? "Platform operator" : "Your customer workspace"}
              </small>
            </p>
            <Appearance />
            {user && <Logout ssoEnabled={ssoEnabled} />}
          </div>
        </div>
        <MobileMenu
          operator={operator}
          accountURL={accountURL}
          userName={user?.name}
          signedIn={Boolean(user)}
          ssoEnabled={ssoEnabled}
        />
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <span>Webdock Studio</span>
          <div className="mobile-appearance">
            <Appearance />
          </div>
          <a href="https://webdock.dev" target="_blank" rel="noreferrer">
            Visit Webdock ↗
          </a>
        </header>
        <main id="main">{children}</main>
        <footer className="workspace-footer">
          Webdock Studio<span>One workspace. Independent websites.</span>
        </footer>
      </div>
    </div>
  );
}
