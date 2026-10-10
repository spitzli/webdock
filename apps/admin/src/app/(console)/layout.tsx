import { I18nProvider } from '@webdock/i18n/react';
import { getRequestI18n } from '@webdock/i18n/next';
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./styles.css";
const space = localFont({
  src: "../../../public/fonts/space-grotesk.ttf",
  variable: "--font-space",
  display: "swap",
});
export const metadata: Metadata = {
  title: { default: "Webdock Studio", template: "%s — Webdock" },
  robots: { index: false, follow: false },
};
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { locale, preference } = await getRequestI18n();
  return (
    <html lang={locale} className={space.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{const t=localStorage.getItem('webdock-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}",
          }}
        />
      </head>
      <body><I18nProvider locale={locale} preference={preference}>{children}</I18nProvider></body>
    </html>
  );
}
