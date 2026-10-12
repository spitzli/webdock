# Relaykit integration implementation checkpoint — 2026-10-12

The public API, Studio pages and operational tools are implemented in this isolated
worktree. They are **not deployed or enabled in production**, and this is not final
F01–F21 acceptance. Production callback scope/reference echo, native incoming
submission integration and the 24-hour rollout pilot remain release gates.

## Current implementation

- Additive checksummed schema, explicit migration target and DML-only runtime grants;
  tenant/connection foreign keys, tombstoned domains and retention indexes.
- Real session/tenant authorization, preview denial, hashed/revocable scoped `wdm_`
  keys, verified BYOK account identity, source-revision checks and managed private
  SEND_API credential creation/rotation. Provider secrets stay server-side.
- Durable single sends and sequential batches, revision-fenced schedules, local
  recipient suppressions, shared native/product customer budgets, rate limits,
  bounded JSON and redacted request logs. Unknown outcomes never automatically resend.
- Authenticated callback inbox, scoped exact-MID/reference/recipient association,
  canonical events and operator reconciliation; atomic settlement and attachment
  erasure. Signed, encrypted-secret customer webhooks have SSRF-safe transport,
  leases, bounded retries, rotation, replay and paginated attempt metadata.
- All 29 public Mail operations, generated OpenAPI and self-hosted Scalar 1.73.1.
  Interactive key use is explicit, session-only, and reset on reload.
- Studio overview, messages and safe HTML, domains/DNS copy, keys, webhooks,
  suppressions, logs/search, UTC analytics/domain filters, settings, team and examples.
  Existing native Mail/Webmail panels remain available.
- Shared owner-governed tenant management, including database protection against
  last-owner removal/ban races and current operator/MFA rechecks after lock waits.
- One job orchestration path with tenant fairness, absolute SQL/network deadlines,
  default-off gateway/dispatch/webhook switches, health and operator CLI. A suspended
  Kubernetes job template is prepared; no scheduler was installed.
- Read-only source Relaykit import and metadata backfill, stable mapping/checkpoint
  checksums, preserved unknown work and paused execution, original retention anchors,
  encrypted webhook secrets and no identity/API-key migration.

## Verification

- Full Auth suite: **216 passed, 0 failed**.
- Full Admin suite: **106 passed, 0 failed**.
- Auth/Admin typechecks, ESLint and production builds passed using synthetic local
  configuration. Final production builds are recorded in the acceptance matrix.
- Restricted Auth-role grant-shape test exercises the owner trigger without
  superuser privileges. Native and product budget races share one allowance.
- [Local metadata benchmark](2026-10-12-mail-product-local-benchmark.json): 100
  tenants, 100,000 messages, 1,000,000 events. List p95 1.97 ms, analytics p95 6.32 ms,
  in-process API p95 297.29 ms at 20 offered requests/second. This is not a production
  SLA and does not measure real-provider due lag.
- [Local restore](2026-10-12-mail-product-local-restore.json): accepted/scheduled/
  unknown messages, pending delivery and idempotency rows restored; encrypted
  sentinel and webhook secret decrypted correctly; unknown outcome preserved.
- Browser uses real local SSO. UI and API simulator sends produced two messages,
  three accepted recipients, two deliveries and one bounce; analytics matched.
  Attachment content was erased while metadata remained. Scripts/images/forms/meta
  refresh were absent from sandboxed HTML. Mobile/desktop light/dark layouts checked.
- Browser exercised one-time API-key display and revocation (subsequent HTTP401),
  webhook creation/rotation/pause/delete, return-to-list after deletion, connection
  pause/resume, team member removal and Ctrl/Cmd+K navigation filtering.
- Public privacy retention paragraphs rendered HTTP200 in English and German.
  The unrelated full public-site test harness requires its own populated CMS server;
  it was not claimed passing against the privacy-only dev server.

## Live provider evidence

The approved separate BYOK account **26191165**, domain **spitzli.me**, provider
limit **10** remains the sole live test account. Exactly **two** actual messages were
sent, from `relaykit-test@spitzli.me` to `dominik@spitzli.dev`; provider analytics
and recipient INBOX UIDs2216 and2221 independently confirmed them. The second message also proved HTML, byte-exact attachments, CID, Reply-To and a custom header. Subsequent permission
probes used empty payloads that cannot create a message, and tracking/account checks
were read-only. See [provider evidence](2026-10-12-mail-provider-contracts.md).

## Explicit limitations and release gates

1. The new product dispatcher rejects customers with an existing native incoming
   service, including suspended/retained instances, until Stalwart product submission
   is integrated. Existing native sending remains available; no direct-Turbo fallback.
2. Provider callback granularity/reference echo and a managed-provider end-to-end
   pilot are not proved. No existing callback consumer was changed. The authenticated
   inbox and reconciliation tests are local fixtures, not live callback evidence.
3. Shared/native domain removal currently returns `domain_in_use`; it cannot
   invalidate another connection. A generalized detach workflow remains separate.
4. No production SQL migration, application deployment, scheduler activation,
   account cutover, production restore or 24-hour monitoring run has occurred.
5. Provider-side suppression readback and the full live multi-recipient accounting/
   delivery matrix remain unverified. Local suppressions are explicitly local.

The [operations runbook](../architecture/mail-operations.md) and
[migration runbook](../architecture/mail-migration.md) describe controlled release
and rollback. Do not mark the whole 20-task plan complete from local tests alone.
