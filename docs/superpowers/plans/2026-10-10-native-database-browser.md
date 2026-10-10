# Native Database Browser Implementation Plan

> Execution: the same agent implements this plan inline using executing-plans and test-driven-development. The user explicitly requested implementation after the design and selected Tabularis PR #676 as the base.

**Goal:** Embed the existing Tabularis database workspace in Studio with tenant-bound authorization and a controlled runtime gateway.

**Architecture:** Export a host-neutral workspace from Tabularis PR #676. Webdock owns database bindings, explicit grants and live session checks; an authenticated gateway routes requests only to an isolated registered runtime. Database roles enforce SQL privileges.

**Tech stack:** React 19, TypeScript, Vite library build, Next.js 16.3.8, existing Better Auth/PostgreSQL services, Tabularis Rust web transport.

**Spec:** `docs/superpowers/specs/2026-10-10-native-database-browser-design.md`.

## Global constraints

- Implement inline at medium reasoning effort; preserve the RelayKit and Git deployment worktrees.
- Tabularis starts at `aeb589e6a3fdd091184a3693bb2f8629bff46f96` in `/home/newt/.t3/worktrees/tabularis/webdock-web-package`.
- Keep existing desktop and standalone entry points functional; use pnpm in Tabularis and npm in Webdock.
- Existing Webdock identity and Snowflake IDs remain authoritative. Database secrets never enter browser DTOs, Git or logs.
- Explicit database grants and restricted database roles are required. Customer preview cannot open sessions.
- No production migration, database query, runtime deployment or package publication is implied by local implementation.

## Review focus

1. A host application must retain its URL, styles and locale after mounting/unmounting a workspace.
2. Switching bindings must not reuse another binding's startup configuration, SQL tabs, event stream or pending request.
3. A forged connection ID or runtime URL must fail before contacting an upstream.
4. Revocation must apply to existing gateway sessions, including events and cancellation.
5. A timed-out write must not be replayed during reconnect or a UI retry.

## Tasks

### 1. Export the Tabularis workspace

Files: `packages/web-ui/src/embed/*`, `src/utils/startupConfig.ts`, supporting provider changes only where needed, `packages/web-ui/package.json`, `vite.library.config.ts`, library TypeScript configuration and mirrored tests.

- [x] Add failing tests for client-isolated startup reads, host routing preservation, scoped appearance and workspace lifecycle.
- [x] Reuse the existing explorer, editor, grid, typed client and provider implementations. Supply a host-neutral workspace entry point and memory routing.
- [x] Make theme/font application target the workspace. Prevent host-level configuration and navigation from appearing in the embedded surface.
- [x] Export library types, client/HTTP transport and stylesheet; externalize React. Produce a local installable artifact without publishing.
- [x] Run focused tests, typecheck, lint, library build and the existing dual-transport regression tests.

### 2. Define Webdock bindings, grants and sessions

Files: `packages/database-contracts/*`, `apps/auth/src/lib/databases/*`, `apps/auth/scripts/migrate-databases.ts`, `apps/auth/tests/databases*.test.ts`.

- [x] Add failing authorization tests for cross-tenant selection, same-tenant users with different grants, operator MFA, customer preview, expiry and revocation.
- [x] Add explicit schema migration for bindings, grants and expiring launch/session records using the existing database/transaction patterns.
- [x] Implement binding administration, listing and one-time launch exchange. Validate project ownership and maintain revision-bound grants.
- [x] Verify real PostgreSQL constraints and concurrent launch consumption in a disposable local test database.

### 3. Connect the gateway to registered isolated runtimes

Files: `apps/database-gateway/*`, Auth database gateway authorization endpoint and shared contracts.

- [x] Add failing tests for upstream spoofing, forbidden RPCs, session revocation, transfer ownership and replay.
- [x] Implement authenticated exchange, bounded forwarding and WebSocket lifecycle with live Webdock authorization. Strip caller-provided upstream credentials/headers.
- [x] Require an operator-registered isolated runtime and fixed connection identity. Fail closed until a compatible runtime is available; do not claim automatic container provisioning from existing hosting inventory.
- [x] Exercise real Tabularis transport where build/runtime dependencies permit, plus deterministic local upstream fixtures for failure cases.

### 4. Integrate Studio

Files: `apps/admin/src/lib/database-*`, `src/components/databases/*`, tenant database routes, delegated API route, navigation and English/German catalogs.

- [x] Add tests for secret-free DTOs, denied grants and safe launch errors.
- [x] Add database directory, operator configuration and a client-only lazy workspace route consuming the packaged Tabularis library.
- [x] Preserve unsaved workspace state on locale/theme updates and reset the full workspace on authorized binding changes.
- [x] Verify Next.js typecheck/build and interactive browser navigation with real local auth/data or documented isolated test fixtures.

### 5. Verify and document operational boundaries

- [x] Run focused regression suites and package installation/build checks; inspect the complete diff.
- [x] Check tenant isolation with two tenants and distinct users within one tenant, and prove DB-role read-only behavior on disposable PostgreSQL.
- [x] Document package provenance, exact runtime setup, migrations, credentials and remaining production activation requirements.
- [x] Record completed checks and actual limitations in `docs/verification/2026-10-10-native-database-browser.md`.

## Execution decisions and progress

- Baseline: Tabularis dual-transport contract suite passes, 38 tests.
- The recommended isolated-runtime approach is the implementation default after the user's start instruction. Shared upstream tenancy is not silently introduced.
- A runtime is registered explicitly for the first integration. Automatic runtime scheduling is a separate hosting-agent capability and will not be fabricated from the current inventory API.

- Updated PR #676 base to `aeb589e6` and reran the full UI suite plus real PostgreSQL runtime checks.
- Added native workspace header, focus mode and Fullscreen API integration at the user's request. The editor remains mounted when switching modes.
- See `docs/verification/2026-10-10-native-database-browser.md` for evidence and explicit limits, including native fullscreen verification and session-scoped unsaved tabs.
