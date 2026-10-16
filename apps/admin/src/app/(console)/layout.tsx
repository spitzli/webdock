import {ClerkProvider} from "@clerk/nextjs";
import {deDE, enUS} from "@clerk/localizations";
import {clerkConsoleEnabled} from "@/lib/console-identity";
import { I18nProvider } from '@webdock/i18n/react';
import { getRequestI18n } from '@webdock/i18n/next';
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./styles.css";
import "./console.css";
const space = localFont({
  src: "../../../public/fonts/space-grotesk.ttf",
  variable: "--font-space",
  display: "swap",
});
export const metadata: Metadata = {
  title: { default: "Webdock Studio", template: "%s — Webdock" },
  robots: { index: false, follow: false },
};
export default async function Layout({ children, toolbar, navigation }: { children: React.ReactNode; toolbar: React.ReactNode; navigation: React.ReactNode }) {
  const { locale, preference, t } = await getRequestI18n();
  const content=<I18nProvider locale={locale} preference={preference}><div className="console-layout"><a className="skip-link" href="#main">{t("Skip to content")}</a>{toolbar}{navigation}{children}</div></I18nProvider>;
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
      <body>{clerkConsoleEnabled()?<ClerkProvider localization={locale === "de" ? deDE : enUS} signInUrl="/login" signUpUrl="/sign-up">{content}</ClerkProvider>:content}</body>
    </html>
  );
}
