# Plugin implementation checkpoint — 2026-10-16

This is a partial implementation checkpoint, **not completion of runtime plugins or the developer platform**.

## Main integration

Fetched `origin/main` at `53eda53`. Merge `0c1972d` includes it and resolves the `apps/admin` → `apps/console` relocation: the waitlist pages and auth shell live in Console, and the toolbar forwards operator context. The original working directory on `main` was not modified.

## Implemented foundation

- Public `@webdock/plugin-sdk/contracts` package with compiled ESM/declarations, strict manifest validation, bounded local schema definitions, capability/method metadata and generated registry extension schema. The method catalog is metadata, not working host-service adapters.
- Pure compatibility/dependency/lifecycle rules in `@webdock/module-sdk/plugins`.
- Journaled migrations `0041` and `0042` for retained installations, releases, operations, grants and documents. A partial unique index prevents overlapping pending/running/blocked operations for one installation.
- Offline, once-only initialization preserves legacy module selection and requires explicit fresh selection. Repeat initialization cannot overwrite operator decisions.
- Operator state requests use the existing signed database context, live operator checks, transaction/advisory lock, revision CAS, idempotency and audit. Requests only record desired state/operations; no reconciler is implemented.
- RLS classification denies unauthenticated/forged worker access. Document access is intentionally closed until invocation-bound authorization is implemented.
- A readiness helper validates schema/policy presence and initialization. It is not wired into API/worker startup yet.

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

Core Task 2 is partial: job/participant/receipt and runtime-candidate/configuration persistence, invocation-scoped document policies, and readiness/startup wiring remain. Core Tasks 3–12 and developer tasks DX1–DX9 are not complete. In particular there is no live built-in admission cutover, plugin controller, verified registry installer, isolated workload runtime, UI bridge, service SDK clients, real plugin DB/cache/object APIs, CLI or generated pilot. Existing admission still uses the prior static configuration. The new state-request service is not exposed as a production operator feature.

Continue in the dependency order in `docs/superpowers/plans/2026-10-16-plugin-developer-platform.md`. The inventory of 151 admission-related call sites is in the ignored runtime-plan workspace and must be audited before changing synchronous ports to async checks. A database state table alone does not provide distributed admission.

No production deployment, public package publication, customer migration or credential rotation was performed. RTK.md was absent. Local PostgreSQL fixtures belong to this execution only.
