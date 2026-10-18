# Product-free core distribution and plugin acceptance

> Execute through independent scoped implementation tasks, then review and run the composed result.

**Goal:** Finish the open acceptance boundaries: a runnable control-plane distribution without product packages, an installed runtime plugin used through Console/API/MCP, and a real Clerk test-instance login if dedicated development credentials are available.
**Context:** docs/architecture/slim-core.md and docs/verification/2026-10-17-local-acceptance.json. Preserve all existing uncommitted work.

## Constraints
- No production account/data/deployment changes. Stall remains independent and live.
- Core means identity/auth contracts, workspaces/projects, permissions/audit, admin shell and isolated plugin lifecycle/capabilities.
- Product operations may remain in an explicitly selected full distribution, but core build cannot externalize unresolved product imports and call that independence.
- Reuse the actual Elysia/Console services and authority checks; no toy replacement API or fake browser sessions.
- Historical schema migrations/data remain retained. Do not weaken RLS, identity revocation, project scopes or retained-resource checks.

## Work
- [x] Separate generic OAuth client/local PostgreSQL infrastructure from product packages.
- [x] Extract product composition from control-plane startup, operation dispatch and metadata, with shared core services and an explicit compatible full entry.
- [x] Build and start core artifact with product package resolution denied; use the real authentication/admin acceptance fixture.
- [x] Install a scoped local plugin release through reviewed installer/activation paths and exercise its real panel, API and MCP; preserve sandbox, TLS and permission boundaries.
- [x] Check for a dedicated Clerk development instance without exposing credentials. Use it only if explicitly identified as test; otherwise document the concrete missing access.
- [x] Run affected suites, review changes, record exact evidence and clean owned fixtures.

## Verified scope

Native browser acceptance covered Better Auth and the dedicated Clerk development instance, including installed synthetic plugin Save/Load, local role and mapping removal, and real provider session revocation. The synthetic user was deleted after verification. No production deployments or data changes were made. Historical SQL migration inventory remains; the new guard prevents unsafe reuse of a full-product database.
