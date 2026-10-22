# Mail plugin

Outgoing mail as a Webdock plugin:

- **Sending domain:** a project adds a domain (one project per domain across the installation) and proves ownership with a `_webdock.<domain>` TXT record. The domain page lists the DNS records (ownership, SPF, DMARC) and the last 20 sends.
- **Own turboSMTP account (BYOK):** a project connects its own turboSMTP consumer key and secret. They are stored AES-256-GCM sealed, are never returned, and from then on every message of the project goes through that account (EU endpoint `api.eu.turbo-smtp.com`). Without one, messages use the platform transport from the private configuration.
- **Sending:** `mail.send` from a verified domain, at most 10 recipients, plain text. It is exposed in the Console, as `POST /v1/plugins/mail/projects/{project}/api/send` and as the MCP tool `send_email`.

Platform transport: `{"kind":"turbosmtp","consumerKey":…,"consumerSecret":…}` or, for local dev only, `{"kind":"smtp","host":"127.0.0.1","port":…}` pointing at a loopback catcher such as Mailpit. `trustUnverifiedDomains` (local dev, loopback catcher only) skips DNS ownership because `.test` names carry no DNS.

- **Mailboxes:** on a project's sending domain, with IMAP and SMTP submission (implicit TLS). Each project gets its own Stalwart Community Edition server (pinned digest); the first mailbox sets it up. Passwords are generated, stored sealed, shown on request and rotatable. A domain with mailboxes shows its DKIM record and cannot be removed until its mailboxes are. The server runs on the cluster through `plugin.workloads` (Deployment, volume, Service, Traefik routes) with a NetworkPolicy that denies all egress, so nothing a mailbox sends leaves the cluster. Mail clients connect to `p<project>.<domain>` through Traefik's `imaps` and `submissions` entry points, which pass TLS through by server name. With `issuer` set, cert-manager issues each engine a certificate for that host, which the engine reads from its mounted Secret; otherwise it is self-signed; the plugin manages the server over Stalwart's HTTP API on a route of its own. Relay-only egress, MX and inbound SMTP come later.

A domain is unique per project; across projects only one may verify it, and the first DNS proof wins. Deletes are idempotent.

Not yet here: DKIM signing for API sends, inbound mail from the internet, webmail, sending limits.

```sh
cargo test --manifest-path plugins/mail/Cargo.toml
# Disposable loopback PostgreSQL for plugin storage; SMTP and turboSMTP are in-test stand-ins.
# Mailboxes run a real engine on the local dev k3s, applied by an in-test stand-in for Core:
WEBDOCK_MAIL_PLUGIN_TEST_ADMIN_URL=postgres://… WEBDOCK_WORKLOAD_TEST_KUBECONFIG=$PWD/.dev-local/k3s/kubeconfig.yaml \
  cargo test --manifest-path plugins/mail/Cargo.toml -- --include-ignored
```
