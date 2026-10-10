# Git deployments implementation plan

> Agent execution: use subagent-driven-development for the independent provider and worker modules; integrate through the existing hosting service. No commits, pushes, purchases, or production activation are authorized.

**Goal:** Deliver customer GitHub sources, immutable builds, approved releases and rollback for configured container and Vercel targets.

**Architecture:** PostgreSQL owns durable work and authorization. Trusted preparation and publication surround disposable EU build execution. Studio, REST and MCP share validated hosting commands.

**Tech stack:** Node 24, TypeScript, PostgreSQL, existing Python hosting agent, GitHub App installation API, pinned Vercel CLI.

**Spec:** `docs/superpowers/specs/2026-10-10-git-deployments-design.md` (first delivery only).

## Global constraints

- Preserve the checked-out baseline; do not implicitly adopt existing deployments.
- Decimal Snowflake IDs, explicit migrations in webdock_auth, no request-time schema creation.
- Reuse authorizeHosting, tenant-preview denial, hosting reservations and controlled agent execution.
- No provider credential in untrusted execution; source and artifacts are tenant-scoped and pinned.
- EU location and isolation evidence are required before enabling workers/storage.
- English source strings and compiled German gettext translations.
- Missing live prerequisites are explicit blockers, never a remote-build or global-token fallback.

## Review focus

1. A disconnected/reconnected installation or changed source must invalidate in-flight publication.
2. A stale worker must not upload a replacement artifact or complete another lease.
3. A timeout after a provider write must reconcile instead of publishing twice.
4. Hostile source/output paths, symlinks and executable configuration must never escape into the trusted publisher.
5. An older push/build must never silently replace a newer desired production release.

## Task 1: Contracts, durable state and authorized commands

Files: `packages/hosting-contracts/src/git-deployments.ts`, its tests and index exports; `apps/auth/src/lib/hosting/git-deployments.ts`, `git-deployment-schema.ts`, explicit migration script and database tests.

- [x] Write and run failing contract/authorization tests for git connection/source/build/release operations, invalid identifiers/paths and preview denial.
- [x] Add tenant-linked connections, sources, builds, artifacts, releases, receipts, workers and OAuth flow tables with restrictive foreign keys and state constraints.
- [x] Implement inspect/configure/request/cancel/approve/rollback commands with optimistic revisions, bounded logs, pagination and audit identity.
- [x] Implement fenced claims, completion, expiration and serialized publication; test duplicate webhook receipts and stale completion.
- [x] Run disposable PostgreSQL tests twice through migrations, then hosting regressions.

Interface: validated `git.*` commands join `commandSchema`; `executeGitDeployment(actor, command)` is dispatched by executeHosting. Trusted worker functions do not accept browser identity claims.

## Task 2: GitHub trusted provider boundary

Files: `apps/auth/src/lib/hosting/git-github.ts`, provider tests; connection flow and webhook routes integrated in Task 4.

- [x] Test raw-body HMAC rejection, bounded payloads, installation/user/repository intersection, pinned revision resolution, suspension and narrowly scoped installation tokens against fake HTTP.
- [x] Implement bounded GitHub HTTP client, App JWT signing, exact repository installation tokens, metadata validation, source resolution and check reports.
- [x] Implement signed event parsing without retaining/logging full payloads; durable receipt/queue writes belong to Task 1.
- [x] Verify provider requests and sanitized errors; document required App permissions and consent.

Interface: provider client accepts a fetch dependency for tests and private service configuration; returns stable IDs and canonical metadata, never browser-visible tokens.

## Task 3: Isolated worker and trusted artifact publication

Files: new `apps/build-worker/` Python runtime and tests; controlled registry additions under `apps/hosting-agent/`.

- [x] Test traversal/symlink rejection, bounded output/logs, token exclusion, cross-build isolation and finite limits before implementation.
- [x] Implement disposable VM execution using explicit administrator-configured isolated capacity; fail closed without verified location/isolation.
- [x] Separate trusted source preparation/artifact intake/publication from customer scripts; use immutable checksums/digests and tenant storage paths.
- [x] Add Dockerfile and pinned Vercel build recipes, trusted prebuilt publisher and immutable registry pull support without arbitrary host commands.
- [x] Exercise fake publishers and local isolated fixtures; live EU/registry/provider checks remain separately recorded prerequisites if unavailable.

Interface: outbound JSON lease protocol carries build ID, fencing generation, exact SHA, recipe, environment identity and limits. Customer code receives only explicitly permitted build values. Publisher consumes validated immutable output and returns operation/provider identity; readiness is separate.

## Task 4: Integration, Studio, REST, MCP and translations

Files: existing hosting bridge/service/client/actions/API/MCP; Git deployment pages/components and GitHub consent routes.

- [x] Integrate provider/worker interfaces with the durable service; all network writes follow persisted intent and recoverable identities.
- [x] Add customer GitHub consent, verified repository picker/source settings, blockers, builds/logs, release approval and rollback using existing forms/tables.
- [x] Expose the same operations to REST/MCP while keeping consent/enrollment on trusted paths.
- [x] Extract/translate/compile English/German messages, run typechecks and existing security/lifecycle tests.
- [x] Verify tenant/operator/mobile flows with T3 preview when local app dependencies are available.

## Task 5: Review and activation record

- [x] Review tenant joins, fencing, source generation checks, untrusted artifact boundaries, failure recovery and UI coverage.
- [x] Record exact passing/failing/not-run checks in `docs/verification/2026-10-10-git-deployments.md`.
- [x] List precise outstanding infrastructure/consent/credential setup, without claiming live activation.

## Execution decisions

- The user explicitly confirmed implementation of the first delivery; proceed without another design approval round.
- Existing T3 worktree is already isolated on `t3code/git-deployments-workflow`.
- Provider and worker modules have disjoint file ownership; their service integration is sequential.
- Runtime dependency installation uses the lockfile. No service provisioning is implied.

## Completion record

Independent implementation and local verification completed. Exact evidence and remaining live activation gates are in `docs/verification/2026-10-10-git-deployments.md`. Live EU isolation, real registry/provider deployments and production migration remain unperformed; these are not claimed by the checked implementation tasks. Browser verification used real local SSO, TOTP, tenant preview and PostgreSQL fixtures.
