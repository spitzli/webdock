import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./styles.css";
import { publicPlatformSettings } from "@/lib/platform";
import { studioURL } from "@/lib/studio-links";

export const dynamic = "force-dynamic";

const space = localFont({
  src: "../../public/fonts/space-grotesk.ttf",
  variable: "--font-space",
  display: "swap",
});
export const metadata: Metadata = {
  title: { default: "Webdock Account", template: "%s — Webdock" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  const platform = await publicPlatformSettings();
  return (
    <html lang="en" className={space.variable}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <Link className="brand" href="/">
            {platform.name}<span>.</span>
          </Link>
          <nav aria-label="Account">
            <Link href="/account">Account &amp; security</Link>
            <Link href="/connections">Connected apps</Link>
            <a href={studioURL()}>Open Studio</a>
          </nav>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          Your {platform.name} sign-in and account security.{" "}
          <a href={`mailto:${platform.supportEmail}`}>Support</a>{" · "}
          <a href="https://webdock.dev/privacy">Privacy</a>
        </footer>
      </body>
    </html>
  );
}
