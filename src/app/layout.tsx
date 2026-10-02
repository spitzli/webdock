import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { themeScript } from '@/lib/theme';
const space = localFont({ src: '../../public/fonts/space-grotesk.ttf', variable: '--font-space', display: 'swap' });
export const metadata: Metadata = {
  metadataBase: new URL('https://webdock.dev'),
  title: 'Webdock — Project previews & client websites by Spitzli',
  description: 'Your project. Well docked. A home for project previews and client websites by Spitzli Development — on a Webdock subdomain or your own domain.',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: { type: 'website', locale: 'en_US', url: '/', siteName: 'Webdock', title: 'Webdock — Your project. Well docked.', description: 'A place on the web. Project previews and client websites by Spitzli Development.', images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Webdock — Your project. Well docked.' }] },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
  icons: { icon: '/icon.svg' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={space.variable} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }}/></head><body>{children}</body></html>;
}
