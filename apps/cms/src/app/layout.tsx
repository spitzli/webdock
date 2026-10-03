import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Website administration — Webdock',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body style={{ fontFamily: 'system-ui, sans-serif', margin: '0', colorScheme: 'light dark' }}>{children}</body></html>;
}
