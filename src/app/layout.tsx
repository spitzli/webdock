import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { themeScript } from '@/lib/theme';
const space = localFont({ src: '../../public/fonts/space-grotesk.ttf', variable: '--font-space', display: 'swap' });
export const metadata: Metadata = {
  metadataBase: new URL('https://webdock.dev'),
  title: 'Webdock — Vorschauseiten & Kundenwebsites von Spitzli',
  description: 'Dein Projekt. Gut angedockt. Webdock ist die Heimat für Vorschauseiten und Kundenwebsites von Spitzli Development — mit eigener Subdomain oder eigener Domain.',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: { type: 'website', locale: 'de_DE', url: '/', siteName: 'Webdock', title: 'Webdock — Dein Projekt. Gut angedockt.', description: 'Ein fester Platz im Web. Vorschauseiten und Kundenwebsites von Spitzli Development.', images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Webdock — Dein Projekt. Gut angedockt.' }] },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
  icons: { icon: '/icon.svg' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de" className={space.variable} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }}/></head><body>{children}</body></html>;
}
