# Priority-A lead demos

User requested independent Webdock projects/tenants and two designs per priority-A lead, and confirmed Payload with persisted test requests. Execute with one dedicated design agent per lead, in waves of up to three concurrent workers. No prospect invitations or emails.

## Architecture

- Canonical platform: webdock. Independent demo apps: sibling webdock-demos/sites/<slug>.
- One Webdock customer/project, auth tenant, Vercel project/domain, database schema/runtime role and Payload SSO client per site.
- Modern HTML at /; faithful reconstructed source style at /old; shared accessible request dialog on both.
- Native package packages/lead-bookings provides validated request policy and Payload collection. Requests are explicitly test/demo data, pending, with no external fulfillment, charge or mail.
- Browser assets are local. Existing live business sites and Pizza2400 remain untouched.
- Payload /admin uses existing Webdock SSO. End-customer accounts are a separate optional addon based on Pizza2400.

## Ownership

Parent: manifest, shared dialog, provisioning/deploy scripts, integration, final checks, tracker links.
Runtime worker: packages/lead-bookings and webdock-demos/template only.
Lead workers: their own sites/<slug>/public and design-notes.md only.

## Execution

- [x] Inspect platform, tenant/deployment paths and environment targets without exposing secrets.
- [x] Analyze all 54 leads and map common addon requirements.
- [x] Record 15 priority-A leads with stable IDs and intended domains.
- [x] Build shared Payload addon/runtime: validate fields, idempotency, public access denial and role boundaries.
- [x] Reconstruct current designs and build distinct modern versions with source-grounded assets/content.
- [x] Register customers/projects via registry service; verify trigger-created tenant mapping.
- [x] Provision isolated schemas/roles and SSO clients; migrate and seed privately.
- [x] Build/deploy each app and attach its own demo subdomain.
- [x] Verify both views, dialogs, persisted requests, anonymous collection denial, SSO and noindex.
- [x] Link verified CMS/provider projects into Studio and add URLs to local lead database.

## Verification focus

No cross-site credentials/data. No public inbox or caller-controlled status. No real booking, mail, or payment. Source reconstruction recognizably follows the original; modern versions structurally individual. Every manifest success corresponds to verified deployed state.

## Accepted refinements

Customers use central Webdock Studio for website content, inquiries and calendars. All raw Payload panels were removed from the new demos and Pizza2400; Studio technical /system redirects to the native workspace. Weekly hours, date overrides, capacity and example appointments are implemented with atomic booking checks. Existing favicons are preserved; six missing icons were created. Verified 15/15 productive CMS links, all website flows and 120 mobile/tablet viewport cases. Pizza management includes editable products/content and protected read-only order/customer overviews. No invitations or business mail sent.
