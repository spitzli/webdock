import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of use — Webdock Studio',
  description: 'Terms for the private Webdock Studio Vercel integration.',
  alternates: { canonical: '/terms' },
  openGraph: { title: 'Terms of use — Webdock Studio', url: '/terms' },
};

export default function Terms() {
  return <article>
    <p className="subtle-label">Webdock Studio · Updated 4 October 2026</p>
    <h1>Terms of use</h1>
    <p>These terms govern the private Webdock Studio integration for Vercel, operated by Dominik Spitzli, trading as Spitzli Development. Contact: <a href="mailto:dominik@spitzli.dev">dominik@spitzli.dev</a>.</p>
    <h2>Access and permitted use</h2>
    <p>The integration is provided to authorised Webdock operators to view hosting information for projects they manage. You receive a non-exclusive, non-transferable right to use the integration for that purpose while access is enabled. Only connect a Vercel team and projects you are authorised to manage. Keep your account and authentication devices secure and report suspected misuse promptly.</p>
    <p>Do not bypass access controls, access another organisation’s data without permission, disrupt the service, or use it unlawfully. Access may be restricted or suspended where reasonably necessary to protect users, data or the service.</p>
    <h2>What the integration does</h2>
    <p>After installation, Studio reads the selected Vercel projects, deployments, domains and installation configuration. It displays project settings such as framework and runtime, deployment status and URLs, production releases, Git branch and commit metadata, and domain verification status. It does not deploy projects, modify domains, or request access to environment-variable values.</p>
    <p>Information reflects the latest successful request and can become outdated. Check Vercel directly before relying on a deployment or domain status for operational decisions. Availability depends on Vercel and the hosting services used by Webdock; no separate uptime commitment is made by these terms.</p>
    <h2>Fees and third-party services</h2>
    <p>Installing this integration does not itself create a paid subscription. Any Webdock development, hosting or support fees require a separate agreement. Your Vercel account remains subject to Vercel’s own terms and charges. Webdock Studio is provided by Spitzli Development, not by Vercel.</p>
    <h2>Your data and ending access</h2>
    <p>You retain your rights in your project data. Webdock processes it only as described in the <a href="/privacy">privacy notice</a> and any applicable service agreement.</p>
    <p>You can stop using the integration at any time. Disconnecting it in Studio deletes Studio’s stored access token. To revoke the installation’s permission at Vercel, also uninstall it in your Vercel team’s integration settings. Project mappings and security audit records are not automatically removed by disconnecting; contact us for a deletion request.</p>
    <h2>Responsibility and changes</h2>
    <p>Statutory rights and liability rules remain unaffected. These terms do not exclude liability for intentional misconduct, gross negligence, injury to life, body or health, or any liability that cannot legally be excluded. A separate service agreement takes precedence for the services it expressly covers.</p>
    <p>We may update the integration and these terms as its functionality changes. The date above identifies this version. Material changes affecting existing use will be communicated to the account contact before they take effect; changes do not apply retroactively.</p>
  </article>;
}
