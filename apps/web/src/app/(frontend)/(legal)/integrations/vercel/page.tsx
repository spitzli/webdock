import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vercel integration — Webdock Studio',
  description: 'Connect selected Vercel projects to Webdock Studio with read-only access.',
  alternates: { canonical: '/integrations/vercel' },
  openGraph: { title: 'Vercel integration — Webdock Studio', url: '/integrations/vercel' },
};

export default function VercelGuide() {
  return <article>
    <p className="subtle-label">Webdock Studio · Integration guide</p>
    <h1>Vercel, in Studio.</h1>
    <p>View hosting information alongside your Webdock project records: current production release, recent deployments, Git branch and commit, runtime settings, and domain verification.</p>
    <h2>Connect your projects</h2>
    <ol>
      <li>Sign in to <a href="https://studio.webdock.dev/integrations">Studio → Integrations</a> with an authorised platform operator account.</li>
      <li>Choose Connect Vercel. Start here so Studio can securely associate the installation with your session.</li>
      <li>In Vercel, select your team and the projects to share. Review the four read permissions: projects, deployments, domains and integration configuration.</li>
      <li>Finish the installation and return to Studio. Match an active Studio project to its Vercel project in Integrations.</li>
      <li>Open the project in Studio to view hosting details. Refresh to request the latest available status.</li>
    </ol>
    <h2>Access and troubleshooting</h2>
    <p>This private integration is available to the configured team and authorised operators. It reads hosting information; it cannot deploy, change domains or read environment-variable values. If access is denied, check that the project was selected during installation. If a connection has been revoked or expired, reconnect from Studio. Vercel outages can temporarily prevent status updates.</p>
    <h2>Disconnect</h2>
    <p>Disconnect in Studio to delete its stored access token. Also uninstall Webdock Studio in your Vercel team’s integration settings to revoke permission at Vercel. Project mappings and audit records remain; contact us if you need them removed.</p>
    <h2>Support</h2>
    <p>Email <a href="mailto:dominik@spitzli.dev">dominik@spitzli.dev</a> with the affected project and the visible error. Never include passwords, access tokens or environment-variable values.</p>
    <p>Read the <a href="/terms">terms of use</a> and <a href="/privacy">privacy notice</a> before connecting.</p>
  </article>;
}
