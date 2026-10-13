# Customer-specific plans and navigation — 2026-10-13

Ported the customer-specific `assign-custom` flow onto current main (e6165cb), preserving `withAuthenticatedDatabase`, tenant locking, revision checks and immutable history. Individual assignments never create a reusable template. Studio and legacy Auth forms include German translations; extras are retained.

Navigation changes remove a redundant SSO delegation from the operator guard (the current central preview/operator check and native Payload authorization both remain), share tenant-list reads only within a React request, and run independent tenant-layout/usage-page reads concurrently. Database billing no longer starts only after all other usage reads finish. Tenant routes have a local loading boundary; main/area links expose pending state without moving layout or requiring animated motion.

Verification before merge:
- Full Auth suite: 238 passed, 4 optional RLS integration tests skipped, 0 failures.
- Full Studio suite: 118 passed, including three new page-guard regression cases.
- New guard test reproduced the redundant delegation before the fix, then passed. Preview denial, missing session, service outage and local role/mapping rejection remain covered.
- i18n: 11 passed. Both app typechecks and production builds passed. Studio lint and changed Auth-file lint passed.
- Full Auth lint reports 8 pre-existing explicit-any errors in database-orders-rls.test.ts and mail-rls-postgres.test.ts; neither file changed here.
- Disposable loopback PostgreSQL initialized from the committed setup script. No production plan/customer writes were used as test fixtures.
- Auth and Studio built locally under Node 24. Vercel secret placeholders were replaced with isolated DB/build-only configuration where initialization requires valid values. Runtime environment stays on the existing hosted secrets; prepare-vercel-output removed dotenv file references and pinned functions to fra1.
- Authenticated pre-release browser fetch samples (complete uncached responses): customers 1694/991 ms; tenant overview 1329/1220 ms; plan/usage 5148/3876 ms. These are a small sample, not a load benchmark. Browser animation-frame navigation timings can include background-tab scheduling and are not treated as precise server timings.

This change does not adopt the unrelated dirty files from the older root checkout. The previous relocation/MCP mismatch does not exist on the selected current-main baseline. Release and after-deployment measurements are reported in the task thread.
