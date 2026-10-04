# Platform administration and Mail

The central account app exposes `/admin` only to currently authorized platform operators with completed security setup. Studio has a Webdock settings link; operators also have an account shortcut. Tenant admins never inherit platform permissions.

Global settings are stored in `webdock_auth.platform_settings`: display name, support/reply-to email, CMS customer-access switch, Mail switch, assigned sending IPv4, default quota and region. Account branding and auth email sender names read current settings. Public signup remains disabled. CMS-off revokes customer CMS claims; operator maintenance access and public websites remain available. Mail-off denies tenant Mail mutations but leaves authentication emails operational.

Master Consumer Key/Secret pairs are stored encrypted in `platform_mail_credential`. AES-256-GCM derives a purpose-separated key from BETTER_AUTH_SECRET and binds each ciphertext to its purpose. Keep that secret stable or re-encrypt credentials when rotating it. Only configured status and the key suffix reach the root form. Removing the stored key does not revoke it at turboSMTP.

## Tenant accounts

`mail_tenant_account` reserves one record per customer, with globally unique provider ID and email. Provisioning is operator-only and requires explicit provider policy acceptance. The generated password is encrypted before the external create call. The provider ID is persisted before quota setup. Unknown timeouts or malformed success responses remain `needs_review`; they never trigger automatic create retries. Definite initial create rejection (400/401/403) releases the still-unmapped reservation for a later explicit retry. A quota failure after creation preserves the account for reconciliation.

Linking requires explicit operator confirmation, verification that the provider ID/email belongs to the connected parent, and application of the configured default quota before readiness. Fresh provisioning cannot be linked concurrently. Stale reservations older than ten minutes can be explicitly reconciled; they are not recreated automatically. Refresh/status/quota cannot turn an unreviewed account ready. The user controls sending quotas/status only through a tenant-bound mapping.

## Sender domains and custom tracking

The current public OpenAPI is incomplete. The existing RelayKit implementation under `Personal/turboSMTP/relaykit/src/lib/turbo.ts` establishes GET/POST `/sender-domains` at the normal management host. Live child-token checks verified these paths, deletion, and custom tracking at the same host. Sender-domain counts may be decimal strings; DELETE returns `message: domain_deleted`. Single-domain sender GET and individual open/click tool GET routes are not used: the latter returned500 in live checks; GET `/tools` provides actual boolean states.

A domain is first claimed locally using the public TXT proof (`_webdock-mail.<domain>`, value `webdock=<token>`). Registration and DNS recheck POST the exact owned name through the customer's child authorization. UI shows ownership separately from actual SPF/DKIM/DMARC flags. DNS plans preserve existing SPF authorization and stronger DMARC policies. DKIM uses the provider's published shared selector/key already used by RelayKit; no RelayKit-branded DNS dependency is introduced.

Custom tracking uses `/tools/link_branding` and the corresponding detail/verify/enable/default/rotation endpoints established by the provider dashboard and verified through scoped API access. DNS CNAME instructions come from returned `domain_name` and `verification_domain`, targeting `smtptrack.com`. Opening, click tracking, custom tracking and match-sender behavior are explicit user settings; adding a domain does not turn them on automatically. Known forced settings cannot be overridden through the Webdock actions. Readback must confirm requested changes.

Provider domain operations use short database reservations, not pooled connections held during network I/O. Sender removal and tracking creation lock the same sender row briefly to prevent deletion of a domain with tracking references. Uncertain writes invalidate cached success flags. Complete bounded lists are required before absence is used as proof for deletion or reconciliation. Stale tracking reservations can be cancelled only after a fresh scoped absence check.

## Customer SMTP/API credentials

The platform authorizes the exact stored subaccount via `/subaccounts/authorize`; only that child token is used to list/create/revoke Consumer keys. Members cannot manage keys. Tenant admins choose SMTP/API sending scopes and optional exact IP restrictions; provider-administration scope is platform-operator-only. Secrets are returned once to the authorized client after creation and are not persisted in local key metadata or audit records. Rotation is create replacement, update the consuming app, then revoke the old key. Paused/disabled sending still permits authorized listing/revocation.

The supplied Spitzli Development master credentials are encrypted in Root administration. Its two subaccounts and assigned IP were read successfully. Live temporary-key creation/revocation, sender creation/list/deletion, and tracking creation/detail/disable/deletion were verified; all temporary resources were removed and no DNS records or emails were sent during those checks. Existing provider accounts are not automatically bound to Webdock customers; an operator selects/provisions that relationship.

## Deployment and verification

Run `scripts/migrate-platform.ts` and `scripts/migrate-mail.ts` from apps/auth with its runtime environment after tenant mapping migration. Auth requires REFERENCES(customer_id) on `tenant_customer` for product foreign keys; the offline tenant grant helper includes this limited privilege. Runtime access to operator notes/status writes remains absent.

Tests cover root revocation, purpose-bound encryption, exact provider requests, safe failure/reconciliation, two-tenant account/domain isolation, public DNS tokens, quota enforcement, and product switches. Local mobile browser checks verified settings persistence, live branding changes, customer root denial, local domain creation and cross-tenant 404. Integration tests exercise tenant boundaries and failure cases with mocks; live provider resource checks supplement these tests without modifying existing keys or settings.

Sources: https://serversmtp.com/turbo-api/ and https://serversmtp.com/turbo-api/turbo-smtp.yaml (checked 2026-10-04).
