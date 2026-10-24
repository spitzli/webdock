# Mail plugin

Outgoing mail as a Webdock plugin:

- **Sending domain:** a project adds a domain (one project per domain across the installation) and proves ownership with a `_webdock.<domain>` TXT record. The domain page lists the DNS records (ownership, SPF, DMARC) and the last 20 sends.
- **Own turboSMTP account (BYOK):** a project connects its own turboSMTP consumer key and secret. They are stored AES-256-GCM sealed, are never returned, and from then on every message of the project goes through that account (EU endpoint `api.eu.turbo-smtp.com`). Without one, messages use the platform transport from the private configuration.
- **Sending:** `mail.send` from a verified domain, at most 10 recipients, plain text. It is exposed in the Console, as `POST /v1/plugins/mail/projects/{project}/api/send` and as the MCP tool `send_email`.

Platform transport: `{"kind":"turbosmtp","consumerKey":…,"consumerSecret":…}` or, for local dev only, `{"kind":"smtp","host":"127.0.0.1","port":…}` pointing at a loopback catcher such as Mailpit. `trustUnverifiedDomains` (local dev, loopback catcher only) skips DNS ownership because `.test` names carry no DNS.

The signed managed installer supplies private `listenTls`, `coreTls`, `corePeers`,
`storageUrl`, `storageCa` and `secretKeyHex` runtime fields, using the same shapes as
the PostgreSQL plugin. Exactly one listener (`listen` or `listenTls`) and callback
(`core` or `coreTls`) are required. Existing absolute private Unix socket configs
remain supported. TLS callbacks verify the Core hostname, CA and exact certificate
pin; incoming probes require the configured Core peer. Remote metadata PostgreSQL
requires `storageCa` and verifies its actual hostname with no plaintext fallback.
Without a CA, `Store::connect` accepts only loopback endpoints, including driver host
overrides. Configuration and TLS files retain the shared owned-file checks.

Describe/Health listening starts even if the Core callback is initially offline.
The deferred callback transport retains CA/name/leaf-pin verification and checks
Unix socket ownership/permissions on every connection attempt. A listener-scoped
startup future waits for ordinary current-generation Core authority,
retrying denial/outage with backoff from 100ms to 5s. Only then does it call `resume`;
a failed resume requires fresh authorization before another attempt. The shutdown
signal cancels the wait, including an in-flight callback or resume future, before
asking the listener to drain active requests. Signal monitoring continues after
resume succeeds; listener exit also cancels startup.
Metadata migrations may run while the runtime is a candidate. Startup failure logs
only `mail_plugin_start_failed`. Update/rollback must retain the metadata database
and sealing key; runtime generation and certificate changes do not replace engine,
mailbox or relay credentials. Physical migration versions remain 1–3 and the signed
logical schema remains 1.

- **Incoming Mail:** explicitly creating the first mailbox or using `incoming.activate` on an owned domain reserves one Stalwart Community Edition engine for the **customer**, not the project. All of that customer's projects, domains and mailboxes reuse its sealed administrator credentials, workload unit `engine-c<customer>` and host `c<customer>.<domain>`. Customer identity comes from Core's signed `customerID`; request input cannot select a customer or engine address. Mailboxes, domains and relay resources keep project ownership, so sharing an engine does not grant access to another project's resource.
- **Retained lifecycle:** `incoming.deactivate` on an owned domain suspends incoming Mail for every project of the customer by scaling the engine to zero. Its workload, volume, credentials and mailbox records remain. The operation stays `suspending` until Core acknowledges the apply revision and observes the zero-replica workload; only then is it `suspended`. Activation and runtime restart reconcile the saved desired state; management failures never destroy or rebuild the volume. Mailbox deletion remains explicit; engine retirement/export/deletion is a separate operator operation, with no customer engine-delete action.
- **Legacy project engines:** the storage migration preserves old `engines` rows, sealed credentials and mailbox records. They have no trustworthy customer mapping in plugin storage, so incoming operations report **migration-required** and do not provision replacements or reconcile those engines. Because another project might belong to the same legacy customer, all incoming activation stays blocked until the operator explicitly migrates the retained records and storage. This change does not migrate deployed Spitzli assets. Keep the plugin encryption key and all retained volumes. The UI exposes the migration state; do not delete legacy records just to bypass it.

The customer engine uses `plugin.workloads` with `{customer, unit, objects}` and no project lifetime dependency. Core owns customer workload authorization, placement, limits and retention. The plugin refuses changed signed ownership for a project until its data is explicitly migrated. Existing deployments and outgoing-only projects allocate no engine merely by being loaded, adding a domain, connecting a relay or sending mail.

The engine's NetworkPolicy denies all egress. IMAP and SMTP submission use implicit TLS through Traefik's `imaps` and `submissions` entry points. With `issuer` set, cert-manager issues the customer hostname's certificate; otherwise the certificate is self-signed. Management uses the separately configured HTTP route guarded by the sealed engine administrator credential. Internal-only management and relay egress remain production gates.

**Delivery boundary:** public reception, recipient-aware SMTP routing and engine→Turbo relay integration are not enabled by this change. Outgoing-only API sends retain the configured platform/Turbo transport. Once a customer has an incoming reservation, API sends fail closed rather than falling back to direct Turbo, including while pending, failed or suspended. Legacy engine records also block the unproven outgoing transition. Suspension does not switch the customer to outgoing-only.

A domain is unique per project; across projects only one may verify it, and the first DNS proof wins. Deletes are idempotent.

Not yet here: DKIM signing for API sends, inbound mail from the internet, webmail, sending limits.

```sh
cargo test --manifest-path plugins/mail/Cargo.toml
# Disposable loopback PostgreSQL for plugin storage; SMTP and turboSMTP are in-test stand-ins.
# Mailboxes test two isolated customer engines, cross-project reuse, retained suspend/resume and restart reconciliation
# against real Stalwart CE on local dev k3s, applied by an in-test stand-in for Core:
WEBDOCK_MAIL_PLUGIN_TEST_ADMIN_URL=postgres://… WEBDOCK_WORKLOAD_TEST_KUBECONFIG=$PWD/.dev-local/k3s/kubeconfig.yaml \
  cargo test --manifest-path plugins/mail/Cargo.toml -- --include-ignored
```
