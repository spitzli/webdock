# Modular Mail verification

Verified locally on 2026-10-15 with Node 24.21.0 and the repository's Bun 1.4.3. No production database or provider account was used.

| Check | Result |
| --- | --- |
| Module SDK, lifecycle, navigation and import-boundary tests | 12 passed |
| API unit suite | 69 passed |
| Console suite, including disabled/draining navigation | 62 passed |
| Selected Mail/Studio/adapter regression suite | 104 passed; one restricted-role case intentionally skipped in this runner |
| That restricted-role Mail case, run separately against the RLS fixture | 1 passed |
| New shutdown preflight under restricted worker RLS | 1 passed |
| API TypeScript/build | Passed |
| Console TypeScript/Next production build | Passed |
| `git diff --check` | Passed |

Total: 249 passing tests across these suites. The database fixtures were created by the existing local Docker fixture scripts and removed after verification. Provider requests used injected fixtures; the regression runner blocks external HTTP.

The independent code review found one regression: draining blocked resuming an existing suspended incoming Mail instance. A new test reproduced it, then passed after service-state-aware admission replaced the blanket activation guard. A follow-up review confirmed that correction and the native outbox reader scope.

The initial broad Mail regression invocation used the repository root as its working directory, causing the migration subprocess to miss `apps/api/.env.test.local`. The full selected suite was rerun from `apps/api` and passed. The initial Console render tests were updated to provide the new installation context; the production build also verifies that context is loaded only at request time.

This verifies the first extraction/installation slice, not the full architecture roadmap. Full authenticated Mail orchestration extraction, other product modules, Clerk cutover, distribution/Helm and release automation remain separate work. No browser E2E, production rollout, live provider delivery, deployment or release publication was performed.
