# Mail plugin

Outgoing mail as a Webdock plugin:

- **Sending domain:** a project adds a domain (one project per domain across the installation) and proves ownership with a `_webdock.<domain>` TXT record. The domain page lists the DNS records (ownership, SPF, DMARC) and the last 20 sends.
- **Own turboSMTP account (BYOK):** a project connects its own turboSMTP consumer key and secret. They are stored AES-256-GCM sealed, are never returned, and from then on every message of the project goes through that account (EU endpoint `api.eu.turbo-smtp.com`). Without one, messages use the platform transport from the private configuration.
- **Sending:** `mail.send` from a verified domain, at most 10 recipients, plain text. It is exposed in the Console, as `POST /v1/plugins/mail/projects/{project}/api/send` and as the MCP tool `send_email`.

Platform transport: `{"kind":"turbosmtp","consumerKey":…,"consumerSecret":…}` or, for local dev only, `{"kind":"smtp","host":"127.0.0.1","port":…}` pointing at a loopback catcher such as Mailpit. `trustUnverifiedDomains` (local dev, loopback catcher only) skips DNS ownership because `.test` names carry no DNS.

Not yet here: DKIM signing, mailboxes (Stalwart), webmail, sending limits.

```sh
cargo test --manifest-path plugins/mail/Cargo.toml
# Disposable loopback PostgreSQL for plugin storage; SMTP and turboSMTP are in-test stand-ins:
WEBDOCK_MAIL_PLUGIN_TEST_ADMIN_URL=postgres://… cargo test --manifest-path plugins/mail/Cargo.toml -- --include-ignored
```
