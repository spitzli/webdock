import { sso } from "@payload-config";
import Link from "next/link";
import { requireOperator } from "../../../lib/server";
import { Navigation, Appearance, Logout } from "../../../components/navigation";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireOperator();
  return (
    <div className="workspace">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand">
          webdock<span>.</span>
        </Link>
        <p className="workspace-label">Project workspace</p>
        <Navigation />
        <div className="sidebar-bottom">
          <p className="operator">
            {user.name || "Operator"}
            <small>System operator</small>
          </p>
          <Appearance />
          <Logout ssoEnabled={Boolean(sso)} />
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <span>Spitzli Development</span>
          <div className="mobile-appearance">
            <Appearance />
          </div>
          <a href="https://webdock.dev" target="_blank" rel="noreferrer">
            Visit Webdock ↗
          </a>
        </header>
        <main id="main">{children}</main>
        <footer className="workspace-footer">
          Webdock Admin<span>One workspace. Independent websites.</span>
        </footer>
      </div>
    </div>
  );
}
