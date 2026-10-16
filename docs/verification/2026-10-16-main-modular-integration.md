# Main integration into the modular worktree

Date: 2026-10-16. The existing local modular-platform work was preserved in checkpoint `85b9a1414425fa8f9d62c02dde3bd78021158542`, then merged with `origin/main` at `108fc5364d4749c4ef164ada835eb457caf37e01` (18 incoming commits). The original safety stash was retained. No production deployment, provider mutation or customer database migration was performed.

## Resolved boundaries

- Kept the Console, Control Plane, Website and Kubernetes agent directories and extracted product modules. Incoming Clerk permissions, authorized-view caches, database startup improvements and canonical Console-origin fixes were integrated through their host ports.
- Preserved both Clerk modes. JSON-configured Clerk continues to use `/v1/studio` and its explicit adapter mappings; the Console activation flag uses `/v1/console` and its own live identity model. JSON mode disables the alternate Console authority even when a stale activation flag remains. Tests cover fresh tokens, mapping revocation, transport isolation and denial before alternate provider lookup.
- Accepted verified Clerk membership without inventing a local membership ID, while keeping native Mail's explicit grants and scoped worker revalidation.
- Kept billing read and management permissions separate, including the offer-update policy. Registry caching still runs inside live authorization and signed database scope.
- Preserved main's deployed `0036_clerk_identity.sql` byte-for-byte. The different local adapter mapping migration is retained byte-for-byte as `0040_clerk_identity_mapping.sql`; fixture and documentation references were updated. Existing production migration checksums were not rewritten.
- Made the Clerk worker regression clean up only its own queued setup on success or failure, so retries cannot claim an earlier test's job.

## Verification

Node commands used Node 24.21.0; npm scripts used the pinned workspace Bun. Database checks used owned disposable local PostgreSQL 18 containers, with separate owner-role and restricted-role databases. Provider access was blocked or explicitly mocked by the existing test runners.

| Command/check | Result |
| --- | --- |
| `npm run test:modules` | 103 passed |
| `npm run test:unit -w @webdock/api` | 151 passed |
| `npm run test:integration -w @webdock/api` | 12 passed across eight isolated files |
| `npm run test:ported -w @webdock/api` | 338 passed; four RLS-only checks skipped here and passed below |
| `npm run test:rls -w @webdock/api` | 30 Bun tests and four Node tests passed, including Clerk worker/Mail and registry cache integration |
| `npm run test -w @webdock/admin` | 82 passed |
| `node --import tsx --test packages/database-runtime/src/index.test.ts packages/api-client/src/*.test.ts` | 18 passed |
| Migration configuration, journal and operator unit tests | Eight passed |
| `WEBDOCK_TEST_INSTALL=true node --import tsx --test tools/migrations/install.integration.test.ts` | Fresh installation, retained-data upgrade and signing-key refusal passed |
| `WEBDOCK_TEST_OPERATOR=true node --import tsx --test tools/migrations/operator.integration.test.ts` | Real MFA/PKCE and composed core API with optional products disabled passed |
| API and Console TypeScript checks; standalone Databases module TypeScript | Passed |
| Production builds for API, Console, Website, Auth and CMS | Passed |
| `python3 -m unittest discover -s agents/kubernetes -p 'test_*.py'` | 78 passed; one existing opt-in test skipped |
| `npm run test:distribution` | Four release tests plus platform/agent/database chart assertions passed |
| `bun docs/scripts/export-mail-openapi.ts --check` | Snapshot matches |
| `mint validate` and `mint broken-links` from `docs/` | Passed |
| Final review and Git conflict/whitespace checks | No outstanding finding or conflict |

The initial integration runs exposed stale test fixtures and the Clerk mapping-authority mismatch; the affected code/tests were corrected before the successful runs above. The database fixture was rebuilt before the final full RLS and ported suites. The final API unit/integration/build run and Console test/type/build run include the separate-authentication-path fix. Owned API/RLS fixtures were removed with `test:teardown`; installer/operator fixtures clean themselves up.

## Limits

The T3 browser preview reported unavailable. Website runtime tests could not run without local Payload configuration; its production build passed. No live Clerk sign-in, production rollout, container-image publication or ARM verification is claimed.

The runtime-plugin and plugin-developer-platform plans remain planned work. This merge does not implement the public plugin SDK/CLI, plugin controller or CLI-generated example plugin and does not mark their acceptance checklists complete.
