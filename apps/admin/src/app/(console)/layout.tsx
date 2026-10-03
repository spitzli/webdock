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
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={space.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{const t=localStorage.getItem('webdock-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
