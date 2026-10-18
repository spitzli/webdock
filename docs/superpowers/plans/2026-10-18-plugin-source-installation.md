# Plugin source installation implementation plan

> **For agentic workers:** Use superpowers:executing-plans for the integrated implementation; independently assigned source adapters follow their focused briefs.

**Goal:** Install supported runtime plugins from GitHub, HTTPS Git, and ZIP through the Console.

**Architecture:** Product-free source intake and durable operator review live in Core.
An artifact-only worker on the existing app node acquires/normalizes sources,
dispatches a private GitHub Actions build, verifies/publishes its immutable image,
and provisions restricted runtimes. No extra KVM or host is required. Existing
manifest validation, grants, invocation isolation, and authenticated health checks
remain authoritative.

**Tech stack:** TypeScript, PostgreSQL/RLS, Next.js, Python stdlib, GitHub Actions/OIDC, existing OCI publisher.

**Spec:** ../specs/2026-10-18-plugin-source-installation-design.md

## Global constraints

- Work only in `/home/newt/.t3/worktrees/webdock/t3code-165bd297`.
- No Hosting dependency in Core, no source execution with API/provider credentials.
- Existing mixed authentication and live plugin installations remain intact.
- Keep private Git credentials out of errors, logs, source archives, and responses.

## Review focus

- Revoked repository/operator access before source transfer or final activation.
- ZIP bombs/traversal/link entries and Git DNS rebinding/redirect credential leakage.
- Interrupted uploads, duplicate commands, expired worker claims and ambiguous publication.
- Exact source/manifest/image identity across review and installation.
- Core-only fresh installation and unconfigured installer behavior.

## Tasks

- [x] Extend existing GitHub client for Contents read, pinned private archive acquisition,
  safe return paths; add credential-boundary tests.
- [x] Add `apps/build-worker/plugin_source.py`: deterministic safe ZIP normalization and
  bounded public/private HTTPS Git acquisition; add hostile-source unit tests.
- [x] Add source job persistence and operator/worker commands with bounded uploads,
  immutable review data, live authority checks, claim fencing and explicit failures.
- [x] Adapt private GitHub Actions builds, artifact verification and restricted Kubernetes provisioning; connect
  final reviewed release to existing grant/runtime activation semantics.
- [x] Expose product-free GitHub browser routes and Console source selection, upload,
  capability review, progress/retry UX.
- [ ] Run focused unit/integration tests, Core artifact checks and real fixture acceptance;
  review the change, document configuration/screenshots, publish the verified change.

## Evidence and rulings

- Existing GitHub tests: 5 passed; existing worker/publisher/integrity/lifecycle/update
  tests: 40 passed during read-only audit.
- The generic GitHub integration is currently gated behind Hosting in four separate
  places; extract protocol ownership rather than importing the full integrations module.
- The old offline installer is not a runtime provisioner and is not exposed as an
  arbitrary online privileged command.
- Acceptance and independent-review evidence is recorded in
  `docs/verification/2026-10-18-plugin-source-installer.md`. Source jobs preserve
  Auth ownership separately from the Registry ID used by GitHub cookies.
- Live rollout uses the existing app node and a private trusted GitHub Actions
  repository. No new server or KVM is provisioned. Worker-issued source metadata
  is matched against GitHub OIDC and the exact returned workflow run ID.
