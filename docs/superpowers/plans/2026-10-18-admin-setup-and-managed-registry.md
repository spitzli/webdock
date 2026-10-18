# Admin setup and managed registry implementation plan

> For agentic workers: use superpowers:subagent-driven-development; preserve existing uncommitted work. User explicitly requested autonomous implementation and publication. Do not commit core changes without an explicit request.

**Goal:** Provide usable initial administrator setup, then implement and publish managed Tabularium hosting as an external plugin.
**Architecture:** Reuse the existing offline operator provisioner from a temporary loopback-only setup web server. Keep offline database privileges out of the persistent core. Managed Registry remains a separate Elysia plugin with UI, API, MCP and host capabilities.
**Tech stack:** Existing Bun/TypeScript, PostgreSQL, Elysia, plugin SDK and Tabularium deployment interfaces.
**Spec:** User requirements in this thread; implementation choices recorded here.

## Constraints
- Preserve Stall production, existing data, and all dirty work.
- English source UI and release screenshots; no Billing/CMS in core.
- No credentials in logs, URLs sent to external services, repo, screenshots or browser responses.
- Setup binds 127.0.0.1 only, requires a random session capability, exact Host and Origin and JSON POST, bounded body, expires, single concurrent submission. No unauthenticated public setup API.
- Reuse operator validation, transaction locks, dedicated offline role, private exclusive output, uncertain-commit recovery and real password/MFA requirements.
- Builds/runtimes local/EU. Publish only verified artifacts. If genuinely blocked by user input or unresponsive 1Password, save checkpoint and shut down as requested.

## Review focus
- Concurrent setup/replay must not create a second operator or overwrite output.
- DNS rebinding/cross-origin callers must not access setup.
- Failed/uncertain commit must preserve recovery material appropriately.
- Existing identities must not be automatically linked.
- Provider credentials and tenant data must never cross plugin tenant boundaries.

## Task 1: Admin setup
- [ ] Add tests for loopback wizard access, expiry, validation, one-shot behavior, safe errors, output and real provisioning.
- [ ] Factor existing operator CLI persistence into a reusable offline runner without weakening safeguards.
- [ ] Add `setup:admin` CLI and accessible dark browser form; configured origins immutable, operator name/email/password entered by operator; secret output stays on filesystem.
- [ ] Update initial setup docs and run unit + disposable PostgreSQL integration + native browser proof.
- [ ] Independent scoped security/code review and resolve findings.

## Task 2: Managed Registry
- [ ] Inspect current SDK, analytics plugin and deployed Tabularium interfaces. Define smallest complete managed-hosting lifecycle using available real capabilities.
- [ ] Create separate plugin repository, manifest, kinds/descriptors, English UI, API/MCP actions, tenant isolation and provider integration.
- [ ] Test locally, review and capture English screenshots; publish public repo, immutable release/image and submit registry when verified.
- [ ] Record actual release/deployment evidence and remaining blockers without overstating coverage.
