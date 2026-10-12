# Relaykit integration implementation checkpoint

This is **not final acceptance** of the 20-task plan. The new customer API, Studio console, workers and production rollout are not complete or enabled. For customers with activated incoming Mail, the new send service fails closed with `native_submission_required` until its Stalwart submission integration exists; it never silently sends around the mandated native route.

## Implemented locally

- Dedicated disposable PostgreSQL test setup, real Better Auth sessions and tenant fixtures; guarded before connecting.
- Shared Mail contracts and validation; additive, checksummed schema migrations with explicit target selection and separate runtime grants.
- Current session/key access checks, preview denial, hashed `wdm_` keys, domain scope, revocation and operator separation.
- Managed internal SEND_API credential reservation/encryption and fail-closed handling of lost creation responses. Internal credentials are hidden/protected in legacy key management.
- Connection-scoped sender checks, manual DNS verification, shared operation fencing and domain tombstones. Native mailbox/sending checks exclude tombstoned ownership. Shared/native domain deletion is rejected instead of invalidating another connection.
- Canonical recipient projection, tenant suppressions with reason precedence, atomic event + recipient + suppression + redacted webhook-outbox writes.
- Durable fenced idempotency, tenant-wide recipient budget reservation/settlement, database rate counters, bounded JSON and log-redaction helpers.
- Durable single-send service, separately encrypted attachments, simulator and tested one-attempt EU/global provider adapter. Unknown handoffs retain their message/reservation and cannot be retried automatically.
- Basic schedule acceptance, revision-checked rescheduling/cancellation and bounded due-dispatch helper.

These are backend services, not a completed user-facing Mail product. Request-log persistence, complete scheduler semantics/fairness, reconciliation and callback integration still need connected work and further race tests.

## Confirmed live test

Owner-authorized separate account **26191165**, sender domain **spitzli.me**, provider limit **10**. Exactly one message from `relaykit-test@spitzli.me` to `dominik@spitzli.dev` was accepted, marked SUCCESS by provider analytics, and independently found in the recipient's inbox. See [provider evidence](2026-10-12-mail-provider-contracts.md).

This live test exercised the provider adapter, not the unfinished public Webdock API or Studio flow. Existing provider accounts, callbacks, DNS and Stalwart instances were not changed. Test account secrets are encrypted outside the repository and the test account remains active.

## Remaining plan work

| Tasks | Remaining work |
| --- | --- |
| T01–T02 | Complete provider callback/reference/accounting evidence; representative index/load measurements and release-role checks |
| T03–T05 | Complete Studio contracts, generic external BYOK identity/rotation/onboarding, shared connection tracking and domain lifecycle integration |
| T06–T07 | Provider suppression readback, remaining event race cases, persisted request logs and integrated HTTP error/request-ID contracts |
| T08–T09 | Full crash/DB-failure/race matrix, paused/archived due-job behavior, immutable schedule eligibility, remaining calendar/limit checks |
| T10–T14 | Durable batches, authenticated callback inbox/reconciliation, outbound webhooks/SSRF protection, analytics, full routes/OpenAPI |
| T15–T17 | New Studio pages/navigation/i18n/accessibility, complete DNS/setup flows, owner-governed team changes |
| T18–T20 | Fair jobs/retention/health, migration/import tooling, complete browser acceptance, release/runbook, production rollout and 24-hour pilot |

No claim of F01–F21 completion, production readiness, or deployed customer functionality is made.

## Review decisions

A separate static review found five correctness/security issues. Regression tests now cover native tombstoned ownership, shared-domain deletion, provider-operation fencing, paused idempotency replay and suppression reason precedence; these issues were corrected.

Two explicit implementation decisions remain relevant: shared-domain deletion currently returns `domain_in_use` until a complete detach workflow exists, and generic BYOK activation stays closed until provider account identity can be proved. The controlled pilot's child-account identity is proved separately through explicit child authorization/key inventory.

The initial full Auth test run exposed local setup gaps: Better Auth's NODE_ENV=test bypassed Origin security and the existing registry lock function was missing. Setup now uses development-mode security and installs the actual registry lock SQL; no production authorization test was weakened.

## Verified checkpoint checks

- Full Auth suite: **172 passed, 0 failed**, including native-path bypass prevention.
- Full Admin suite: **106 passed, 0 failed**.
- Auth and Admin TypeScript checks and ESLint: passed.
- Auth and Admin production builds against synthetic local configuration: passed. Builds did not run migrations or use production provider credentials.
- `git diff --check`: passed.
- No production application deploy, database migration, callback cutover, DNS write or new public API activation.

The build/tests validate this partial code checkpoint; they do not replace the remaining API, browser, callback, operational, migration or 24-hour acceptance work.
