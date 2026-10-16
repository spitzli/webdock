# Plugin implementation checkpoint — 2026-10-16

This is a partial implementation checkpoint, **not completion of runtime plugins or the developer platform**.

## Main integration

Fetched `origin/main` at `53eda53`. Merge `0c1972d` includes it and resolves the `apps/admin` → `apps/console` relocation: the waitlist pages and auth shell live in Console, and the toolbar forwards operator context. The original working directory on `main` was not modified.

## Implemented foundation

- Public `@webdock/plugin-sdk/contracts` package with compiled ESM/declarations, strict manifest validation, bounded local schema definitions, capability/method metadata and generated registry extension schema. The method catalog is metadata, not working host-service adapters.
- Pure compatibility/dependency/lifecycle rules in `@webdock/module-sdk/plugins`.
- Journaled migrations `0041`, `0042` and `0043` for retained installations, releases, operations, grants and documents. A partial unique index prevents overlapping pending/running/blocked operations for one installation.
- Offline, once-only initialization preserves legacy module selection and requires explicit fresh selection. Repeat initialization cannot overwrite operator decisions.
- Operator state requests use the existing signed database context, live operator checks, transaction/advisory lock, revision CAS, idempotency and audit. Requests only record desired state/operations; no reconciler is implemented.
- RLS classification denies unauthenticated/forged worker access. Document access now requires signed invocation scope with current customer/project, grant, actor/session or job claim/lease, runtime/configuration generation and capability. Write receipts are immutable and operation-bound.
- API and worker startup now require the schema, policies, invocation helpers and explicit installation bootstrap. API readiness rechecks this state. The operator procedure is documented in `docs/operations/plugin-state-bootstrap.md`.

## Verification

- Console tests: 82 passed; Console TypeScript check passed after merge.
- `npm run test:modules`: 121 passed, including packed SDK installation/import in an empty directory using the offline npm cache. Repeated under Node 24.15.0: 121 passed.
- `npm run test:unit -w @webdock/api`: 151 passed.
- API TypeScript check and API build passed.
- Restricted PostgreSQL 18 fixture: plugin bootstrap/CAS/idempotency/revocation/forged-context regression passed (15 assertions, including absent bootstrap and missing policy rejection). Overlapping new-revision requests fail without advancing revision; a new request works after terminal completion.
- The complete RLS suite passed again after the operation-exclusivity fix.
- `WEBDOCK_TEST_INSTALL=true node --import tsx --test tools/migrations/install.integration.test.ts`: passed, including empty installation, explicit plugin bootstrap under the offline role, repeated bootstrap, retained-data upgrade and signing-key refusal.
- Generated schema check passed. Actual pinned Tabularium server round-trip remains Core Task 5 work.
- Independent review found overlapping lifecycle operations and invalid relational defaults; both were reproduced in failing tests, fixed and re-reviewed with no remaining findings in that scoped review.
- `npm run test:web`: two HTTP tests failed with `fetch failed` because no website server was running on localhost:3104; the theme unit test passed. These HTTP checks are not claimed as passing.

## Remaining required work

Core Task 2 persistence, invocation-bound document RLS and startup wiring are implemented. Core Tasks 3–12 and developer tasks DX1–DX9 are not complete. In particular there is no live built-in admission cutover, plugin controller, verified registry installer, isolated workload runtime, UI bridge, service SDK clients, real plugin DB/cache/object APIs, CLI or generated pilot. Existing admission still uses the prior static configuration. The new state-request service is not exposed as a production operator feature.

Continue in the dependency order in `docs/superpowers/plans/2026-10-16-plugin-developer-platform.md`. The inventory of 151 admission-related call sites is in the ignored runtime-plan workspace and must be audited before changing synchronous ports to async checks. A database state table alone does not provide distributed admission.

No production deployment, public package publication, customer migration or credential rotation was performed. RTK.md was absent. Local PostgreSQL fixtures belong to this execution only.

## Continuation verification — 2026-10-16

- Migration 0043 adds configuration/secret references, current/candidate/previous runtime generations, participant heartbeats, scoped job executions, invocations and retained mutation receipts.
- Restricted-role tests: two customers, two projects within one customer, ordinary member writes through explicit plugin grants, read-intent mutation denial, secret-reference isolation, receipt immutability/operation binding, grant/member/generation revocation, job slot uniqueness, claim/lease loss and exact participant heartbeat identity. Future-dated invocation authority is rejected; the regression was observed failing before the fix.
- Actual process tests prove API startup refusal before explicit bootstrap, normal startup afterward and readiness 503 after bootstrap removal. API cookie/session behavior and a worker storage batch now also run using restricted database credentials.
- Complete RLS suite passed after integration; the final invocation-time-bound change passed its focused RLS regressions (22 assertions). Module suite: 121 passed. API unit suite: 151 passed. API check/build and fresh-install/retained-upgrade integration passed.
- The RLS runner now honors explicitly requested registered test files and rejects unknown selections; the full invocation still includes the ported RLS suites.
- Independent review of the continuation found no concrete issues. There is still no public plugin broker or live built-in admission; database enforcement does not substitute for the remaining endpoint/controller work.

## Registry project and admission transaction checkpoint

The owner authorized creation of a separate registry project. `Webdock Plugin Registry` was created in the Webdock workspace and read back through the Console; see `docs/operations/plugin-registry-project.md`. It has no hosting/application/services yet. No registry deployment is claimed.

Core Task 3 is in progress. `createModuleAdmission`/`withModuleAdmission` now provide an SQL-only transaction boundary sharing an advisory fence with state mutations. Callers must persist their real operation/outbox using the supplied connection and operation ID; this helper is not a second job queue. Nested checks share that connection and cannot change identity, pool or transaction boundaries. Continuations require an existing operation ID and a trusted authorization callback that checks its journal/lease using the same connection. Provider calls belong after the durable transaction commits.

Restricted-role tests use a second database connection to observe a waiting exclusive lock: a drain waits for in-flight admission, then fresh provisioning fails despite a stale enabled snapshot. Tests also cover authorized and denied continuations, read-only mutation denial, rollback, unavailable pools, swallowed nested failures, falsy rejection values, caught SQL errors and early COMMIT attempts. COMMIT must actually report `COMMIT`; PostgreSQL's successful `ROLLBACK` response for an aborted transaction cannot authorize subsequent side effects. The existing SQL command parser is reused for transaction ownership checks.

`readPublicInstallation` reads current persisted public metadata without caching; it is not an authorization check.

The transaction primitives are **not yet wired into all service ports/routes/workers**. The 151-call-site audit and dynamic route composition remain outstanding, so Core Task 3 and live module control are not complete. No change to existing module availability is claimed from these helpers alone.

Verification for this transaction checkpoint: focused admission RLS regression passed 24 assertions; the complete registered RLS suite passed after the fixes. API unit tests: 151 passed; module tests: 121 passed; database-runtime tests: 11 passed. API build/typecheck passed after correcting the test's optional-ID type. Independent review identified the aborted-COMMIT and falsy nested-failure cases; both received failing-then-passing regressions. Existing service/route integration remains intentionally unclaimed.
