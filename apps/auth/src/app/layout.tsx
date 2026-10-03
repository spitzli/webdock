import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./styles.css";

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

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={space.variable}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <Link className="brand" href="/">
            webdock<span>.</span>
          </Link>
          <span>Account</span>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          Your Webdock account. Your workspace and websites.
        </footer>
      </body>
    </html>
  );
}
