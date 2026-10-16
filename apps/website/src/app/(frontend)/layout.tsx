import {I18nProvider} from '@webdock/i18n/react';
import {getRequestI18n} from '@webdock/i18n/next';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import '../globals.css';
import { themeScript } from '@/lib/theme';
const space = localFont({ src: '../../../public/fonts/space-grotesk.ttf', variable: '--font-space', display: 'swap' });
export async function generateMetadata():Promise<Metadata>{const {t,locale}=await getRequestI18n();return {
  metadataBase: new URL('https://webdock.dev'),
  title: t("Webdock — Project previews & client websites by Spitzli"),
  description: t("Your project. Well docked. A home for project previews and client websites by Spitzli Development — on a Webdock subdomain or your own domain."),
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: { type: 'website', locale: locale === 'de' ? 'de_DE' : 'en_GB', url: '/', siteName: 'Webdock', title: t("Webdock — Your project. Well docked."), description: t("A place on the web. Project previews and client websites by Spitzli Development."), images: [{ url: '/og.png', width: 1200, height: 630, alt: t("Webdock — Your project. Well docked.") }] },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
  icons: { icon: '/icon.svg' },
};}
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const {locale,preference}=await getRequestI18n();
  return <html lang={locale} className={space.variable} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }}/></head><body><I18nProvider locale={locale} preference={preference}>{children}</I18nProvider></body></html>;
}
