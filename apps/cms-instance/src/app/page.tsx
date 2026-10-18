import { loadCMSConfig } from "../lib/config.ts";
export const dynamic = "force-dynamic";
export default function Page() {
  const config = loadCMSConfig();
  return (
    <main>
      <h1>{config.siteName}</h1>
      <p>Published pages are available at /en/your-page or /de/your-page.</p>
      <a href="/cms">Open CMS</a>
    </main>
  );
}
