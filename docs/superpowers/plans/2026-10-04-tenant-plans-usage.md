# Tenant plans, offers and usage implementation plan

> **For agentic workers:** Use superpowers:executing-plans; independent library work may use dispatching-parallel-agents with fixed interfaces.

**Goal:** Assign reusable/custom plans, accept tenant-bound offers without checkout, and show measured storage alongside existing Mail usage.

**Architecture:** Add central PostgreSQL tables to the existing auth control plane. Reuse current operator/tenant authorization and audit, use immutable plan/offer snapshots and optimistic subscription revisions. Keep provider storage credentials encrypted and separate from public view models.

**Tech Stack:** Existing Next.js, TypeScript, pg, Node crypto and Vercel Blob SDK.

**Spec:** ../specs/2026-10-04-tenant-plans-usage-design.md

## Constraints and review focus

- No payment/checkout, automatic email send, destructive media migration or retroactive limits.
- Wrong-tenant users, members, revoked/expired links and changed subscription revisions cannot accept offers.
- Concurrent acceptance is atomic and repeat acceptance cannot duplicate allocation.
- Plan edits cannot mutate active snapshots; extras survive plan assignment.
- Provider errors/incomplete inventory never become zero usage; storage credentials never appear in views.
- Announce measurement/enforcement limitations explicitly instead of presenting configuration as enforced quotas.

## Tasks

- [x] Implement `apps/auth/src/lib/plans.ts` and `tests/plans.test.ts`: schema, allowance validation, operator plan creation/assignment/extras, expiring tenant-bound offers, atomic acceptance and history. Test authorization, malformed numbers, stale revisions and replay/concurrency against disposable PostgreSQL.
- [x] Implement `apps/auth/src/lib/storage-usage.ts` and `tests/storage-usage.test.ts`: encrypted project/environment/store mappings, bounded complete Blob inventory, stale snapshots and tenant-scoped views. Verify prefix boundaries, cross-tenant denial, pagination failure and no credential exposure.
- [x] Build root `/admin/plans`, tenant `/tenants/[customerID]/usage` and private `/offers/[token]` UI/actions with native fields, accessible feedback and mobile layouts. Add navigation from root and tenant pages; use snapshot totals and explicit no-checkout/enforcement copy.
- [x] Add idempotent `scripts/migrate-plans.ts` applying new schemas after existing auth initialization. Apply disposable DB first; run tests, typecheck, lint and build. Inspect every diff and verify integration failures rather than ignoring them.
- [x] Verify authenticated browser flows with temporary fixtures and clean them afterwards. Deploy additive schema and auth app only after checks pass. Inventory existing Blob connections read-only; do not relocate media or activate guessed mappings. Update TODO/architecture with actual delivered scope and remaining enforcement/migration work.

## Verification and rulings

- 49 auth/integration tests, typecheck, lint and production build passed before initial deploy. Mobile browser covered template creation, assignment, extra preservation, custom offer creation/customer acceptance, root denial and storage display. Disposable browser fixtures removed.
- Production tokens and CMS metadata verified active prefixes before importing non-overlapping legacy measurement mappings. No files moved or production customer plans assigned.
- Added hourly authenticated storage cron with daily per-mapping cadence. Production registration verified. CLI pulls mask sensitive CRON_SECRET values; a probe using that placeholder correctly returned 401, not an application credential defect.
- Initial live refresh exposed a new-connection timeout during eager Better Auth OAuth resource initialization, also observed on unrelated account routes. A later refresh succeeded. Request-lazy recoverable initialization is being verified without retrying writes; the provider/network timeout itself remains unproven.

- Final verification: 57 tests pass, typecheck/lint/build pass; auth request-lazy recovery deployed at https://webdock-auth-8av6a06e4-spitzli.vercel.app. Concurrent authenticated account/sites/tenant/session requests and another wave after idle all returned 200. Signature-required Git commit timed out in 1Password (exit124), so changes remain staged without bypassing signing.
