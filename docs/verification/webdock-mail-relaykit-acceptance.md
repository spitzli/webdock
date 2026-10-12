# Webdock Mail / Relaykit acceptance

**Status: implementation checkpoint, not production acceptance.**

Checked on 2026-10-12 in branch `t3code/clarify-relay-kit-docs-work`, based on
`1e71b79`. The commit containing this document identifies the reviewed source;
the recorded results apply to that source, not a production deployment.

Environment: Node 24.21.0, isolated PostgreSQL 17 on loopback port 5438,
synthetic Auth/Admin configuration, real local SSO and T3 browser. Provider
tests used only approved BYOK account 26191165 and the named own addresses.

“Local” below means implemented and exercised against isolated services. It
does not imply provider acceptance, production migration or operational release.

| ID | Capability | Evidence and result | Remaining acceptance |
|---|---|---|---|
| F01 | Connections and quotas | Local managed credential lifecycle, BYOK identity/revision, pause and shared-budget races; actual BYOK account verified | Managed-provider live pilot |
| F02 | Sender domains | Local tenant/connection fences, ownership and DNS checks, tombstones; live spitzli.me SPF/DKIM/DMARC verified | Shared/native domain detach intentionally returns `domain_in_use` |
| F03 | Manual DNS | Native manual DNS workflow and copy actions retained; no DNS writes | Live onboarding walkthrough on a fresh test domain |
| F04 | Tracking | Shared tracking service extended to BYOK with account/source checks; live read-only endpoints returned 200 | Live toggle, rotation and engagement callbacks |
| F05 | API keys | Permission/domain/tenant tests; real UI create/revoke followed by HTTP 401 | None for local contract |
| F06 | Sending | Real handlers, idempotent durable dispatch, suppression and unknown-outcome tests; two provider deliveries independently found in own inbox | Live Cc/Bcc matrix; new product submission through native Stalwart still missing |
| F07 | Attachments/CID | Local encryption/erasure; live HTML, byte-exact text/PNG attachments, CID, Reply-To and custom header | Provider supplies HTML without separate text alternative when both are supplied; documented limitation |
| F08 | Batches | Full preflight, sequential prefix outcomes, asynchronous polling and replay tests | Live provider batch accounting |
| F09 | Scheduling | Revision/cancellation, fairness and durable lease tests | Real due schedule in 24-hour pilot |
| F10 | Idempotency | Concurrent requests, durable message linkage, 24-hour replay and unknown preservation | None for local contract |
| F11 | Simulator | Delivered/bounced/complained tests with no provider calls, quota or real suppression; UI/API walkthrough | None for local contract |
| F12 | History/preview | Scoped SQL reads, Bcc/content access, timeline; sandbox/CSP and malicious HTML browser checks | Live callback reflected in the same message view |
| F13 | Provider events | Authenticated durable inbox, lossless IDs, source/MID/reference/recipient fences, duplicate/early/late callbacks and exact-account reconciliation tested | Actual callback granularity/reference echo and provider status matrix |
| F14 | Analytics | SQL 7/30/90-day filters; browser showed 2 simulated messages, 3 accepted recipients, 2 delivered, 1 bounced | Same calculation with live callbacks |
| F15 | Webhooks | Signing, SSRF/DNS pinning, leases, bounded retries, rotation/replay and final-attempt crash tests; UI CRUD | Own publicly reachable signature-checking receiver and real provider event chain |
| F16 | Suppressions | Manual and canonical bounce/complaint/unsubscribe projection tested; tenant boundaries | Provider-side suppression readback; UI labels current list as local |
| F17 | Logs | Redacted requests, scoped search/filter/cursors and bounded retention tests | Production retention observation |
| F18 | Docs | 29 operations matched to actual handlers; self-hosted Scalar, explicit ephemeral key entry; code examples and provider MIME limitations | None for local contract |
| F19 | Team | Existing tenant service, owner-governed roles, last-owner DB guard, restricted-role and concurrency tests; browser removal | Live invitation/acceptance by explicitly designated second test person |
| F20 | Studio | Native shell/themes retained, page search, copy actions, connection selection; mobile/tablet/desktop and light/dark checked | Complete release-environment walkthrough |
| F21 | Operations/migration | Fair bounded jobs, kill switches, paused CronJob template, importer/backfill fixtures, local load and restore evidence | Production migration, scheduler, restore/rollback rehearsal and 24-hour pilot |

## Final source checks

- Auth full suite: **216 passed, 0 failed** (includes Mail tests).
- Dedicated Mail suite: **101 passed, 0 failed**.
- Admin full suite: **106 passed, 0 failed**.
- Auth/Admin TypeScript and ESLint: exit 0.
- Translation catalog: 8 catalogs / 3,153 messages validated.
- Auth/Admin production builds: exit 0 with synthetic local configuration.
- Public privacy page: English and German HTTP 200. Full public-site suite was
  not accepted: its populated CMS test environment was not running.
- Independent reviews covered authorization/owners, provider credentials,
  imports, API/batch/webhook lifecycle and job races. Reported findings were
  addressed and regression-tested, including late acceptance after unknown
  content expiry: an event cannot revive expired bodies or attachments.

Local test logs remain in the ignored work ledger directory; tracked benchmark,
restore and provider artifacts contain no credentials.

## Live evidence and release boundary

Exactly two approved emails from `relaykit-test@spitzli.me` to
`dominik@spitzli.dev` were accepted by turboSMTP, reported delivered and found in
INBOX (UIDs 2216 and 2221). This proves provider transport and recipient receipt;
it does not prove the whole deployed Webdock callback/webhook chain.

- [Provider contract evidence](2026-10-12-mail-provider-contracts.md)
- [MIME receipt](2026-10-12-mail-product-mime-receipt.json)
- [Local performance](2026-10-12-mail-product-local-benchmark.json)
- [Local restore](2026-10-12-mail-product-local-restore.json)
- [Operations and rollback](../architecture/mail-operations.md)
- [Migration](../architecture/mail-migration.md)

No production application, schema migration, scheduler, callback consumer or
DNS configuration was changed. Gateway/dispatch/webhook switches default off.
Existing incoming Mail instances and retained data remain intact. Customers
with any native incoming service remain explicitly rejected by the new direct
dispatcher until the Stalwart submission integration is implemented.

## Developer onboarding UX follow-up

On 2026-10-12, added a linked four-step first-email guide, explicit server-side
key handling, provider/Webdock credential explanations, resource-specific empty
states and actionable message-status descriptions. Quickstart explains HTTP
success versus delivery, safe idempotent retries and simulator setup; advanced
webhook verification is collapsed by default. Webmail retains everyday language.

Admin suite106/106, TypeScript and production build passed. T3 browser verified
real SSO, German copy, connection-preserving setup navigation and empty API-key
guidance, with no document overflow at390/1440px. This is an implementation and
browser check, not a usability study with an unprepared external user.

## Main workspace integration follow-up

The Mail API now uses main's AreaNavigation, including its mobile disclosure.
Sending owns messages, analytics, Quickstart, API keys, webhooks, suppressions and
request logs; the selected connection is retained across Mail navigation. Native
incoming Mail and Webmail remain in the mailbox area. API connection management
is restored in Settings, with provider-account setup in a disclosure. Configured
API connections use the scoped domain surface; unconfigured accounts retain the
native domain setup. Old Mail-team links redirect to the workspace team page,
where owner/admin membership rules are preserved. Only scoped Mail form, preview
and metric styles are restored; main's shell and navigation styles stay in place.

T3 browser verified real SSO, Sending navigation, scoped domain list, restored
settings and team redirect. Mobile390px has no document overflow and uses
Mail → Sending → Messages area selection. No provider settings or sends changed.

Final integration checks: Admin114/114, TypeScript, ESLint and production build
passed; German catalog9/3279 validated. Backend/provider release gates above
remain unchanged.
