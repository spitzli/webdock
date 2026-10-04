import Link from 'next/link';
import { ThemePicker } from '@/components/theme-picker';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <>
    <a className="skip-link" href="#content">Skip to content</a>
    <header className="site-header wrap flex items-center justify-between">
      <Link className="brand" href="/" aria-label="Webdock home">webdock.</Link>
      <ThemePicker />
    </header>
    <main id="content" className="wrap legal-copy">{children}</main>
    <footer className="wrap site-footer"><Link href="/">Webdock</Link><nav aria-label="Legal"><a href="/terms">Terms of use</a><a href="/privacy">Privacy</a></nav><a href="mailto:dominik@spitzli.dev">dominik@spitzli.dev</a></footer>
  </>;
}
