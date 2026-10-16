# Mail identity boundary implementation plan

> Execute inline with the existing tests and an independent final review. This continues the approved modular-platform migration.

**Goal:** Remove Better Auth session/member schema knowledge from Mail authorization and expose typed local identity through an adapter; retain every current permission check and document the usable module configuration.

**Architecture:** `packages/core` defines the identity-directory contract and database-reader type. `adapters/auth-better-auth` reads existing local user/session/membership projections and verifies header sessions through an injected Better Auth resolver. `modules/mail` owns native Mail and product access policy through explicit identity dependencies. API files compose these implementations and preserve their current exports. No global configurable service locator, auth cutover or schema migration.

**Spec:** The supplied modular-platform architecture, phases 2–3; current baseline and lifecycle contract in `docs/architecture/module-installation.md`.

**Tech stack:** Existing TypeScript, npm workspaces, PostgreSQL, Bun API and Node 24 tests.

## Constraints

- Preserve local user/session/resource IDs and existing authorization/RLS transaction contexts.
- Resolve identity on every authorization; no cached role, membership or preview decisions.
- Retain native row locks and the distinction between live browser sessions and already-admitted queued work.
- Mail operators still require explicit mailbox grants for content access.
- Core and adapters never import apps; Mail module never imports a concrete identity/provider adapter.
- Existing changes remain intact; no live infrastructure operations.

## Tasks

- [x] Define `SessionReference`, identity/membership snapshots and `IdentityDirectory` using only local IDs and a typed database reader. Add Better Auth adapter and prove session mapping strips provider secrets, expired sessions and preview checks remain live, membership misses differ from missing tenants.
- [x] Extract native Mail access policy into `modules/mail/src/server/native-access.ts` with an injected `IdentityDirectory`. Replace the API file with composition/compatibility exports. Test alternate identity directories, preview rejection, operator-without-mailbox-grant denial and revoked queued grant rejection.
- [x] Extract product authorization into `modules/mail/src/server/product-access.ts` with explicit identity and BYOK-policy dependencies. Keep API key/job validation, gateway/connection admission and operator auditing in the module. Preserve `authorizeMailSession` as API composition; route all Mail session calls through the shared session reference resolver.
- [x] Move the remaining turboSMTP account verification transport into its adapter, sharing the existing Mail error contract without importing API code.
- [x] Extend boundary checks and regressions. Run API typecheck/build, module/unit tests, complete selected Mail/Studio regressions and restricted-role tests on local disposable databases.
- [x] Update internal architecture/verification records and add a public module-configuration guide with navigation, links and tested limitations. Check generated OpenAPI, Mintlify validation and broken links.

## Review focus

- Operator security must be true, not a truthy untrusted value; incomplete users and unknown roles fail closed.
- Removal of the tenant mapping or membership must take effect on the next call, including previously created actors.
- Revoked/expired browser sessions reject access; queued work rechecks local bans and mailbox grants without requiring the originating browser session to survive.
- Native content access cannot be inferred from management rights or an operator flag.
- No identity adapter or session token becomes reachable from client exports.

## Execution record

All tasks completed in the existing worktree. The database contract deliberately retains PostgreSQL and current local identity projections; this does not claim a Clerk migration or a provider-independent RLS schema. Native row locks and queued-work semantics are preserved. The independent review compared the extracted policy with the prior implementation and reported no concrete actionable issue.

Verification and remaining architectural scope are recorded in `docs/verification/2026-10-15-mail-identity-boundary.md` and `docs/architecture/modular-platform-status.md`. Public documentation is validated, link-checked and inspected in the T3 browser preview.
