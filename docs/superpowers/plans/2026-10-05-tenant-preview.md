# Tenant preview Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Preserve the existing uncommitted work from this conversation.

**Goal:** Let verified operators inspect one customer's tenant-admin view without changing customer data.
**Architecture:** Central Auth stores a session-bound preview context; Studio projects the customer view and all browser write paths enforce read-only state. The original identity remains intact.
**Tech Stack:** Existing Next16, React19, Node24, PostgreSQL, Better Auth and Payload4.
**Spec:** `docs/superpowers/specs/2026-10-05-customer-view-and-canvas.md`

## Global constraints
- Use existing auth/MFA checks, no customer identity tokens or fake users.
- Scope by the authenticated central session, not a removable client hint.
- Expiry remains restrictive until explicit exit.
- No bridge secrets in client data.
- Existing Studio/CMS UI and runtime rights remain otherwise unchanged.

## Review focus
- Concurrent tabs and direct native REST must not bypass read-only state.
- A tenant with no members must still be inspectable and labelled as a role preview.
- Suspended customers, revoked operator rights and expired central sessions invalidate access immediately.
- Shop customer/order read visibility must retain tenant-admin view while mutations remain blocked.
- Exit and logout must leave other browser sessions unchanged.

### Task 1: Central preview service
Files: new `apps/auth/src/lib/tenant-preview.ts`, new test `apps/auth/tests/tenant-preview.test.ts`; modify `studio-api.ts` and migration script.
Interface: `startTenantPreview(customerID)` and `exitTenantPreview()` are Studio operations. `session.preview` is the exact public object in the spec. Other preview operations use an explicit read allowlist.
- [x] Add failing tests for start authorization, session binding, no-member tenants, target isolation, mutation denial, expiry, exit and audit.
- [x] Add an additive `webdock_auth.studio_tenant_preview` table and schema registration.
- [x] Authenticate real operator and active tenant on every call. Project only permitted target data. Fail closed for expired or invalid context.
- [x] Run Auth tests on disposable local database; inspect schema migration separately before production use.

### Task 2: Studio enforcement and UI
Files: `apps/admin/src/lib/studio-client.ts`, `demo-bridges.ts`, `studio-shop.ts`, native Payload route adapter, registry/operator entry helper, portal layout/StudioShell, tenant detail; new preview actions/banner.
- [x] Extend the session contract without serializing delegation secrets.
- [x] Add native POST start/exit controls with exact-origin checks and fixed local redirects.
- [x] Render a permanent customer/expiry/read-only banner and customer navigation.
- [x] Gate CMS writes using real server session preview state, separately from site display roles. Hide or disable write controls.
- [x] Block operator/native browser surfaces during preview while allowing authentication/exit.
- [x] Test omitted context, foreign site IDs, native API attempts and readonly shop/admin rendering.

### Task 3: Verification and rollout
- [x] Review security boundaries across both services and direct bridge paths.
- [x] Run typechecks, relevant full tests and builds.
- [x] Apply only additive schema changes; deploy Auth then Studio.
- [x] Verify live operator entry, target visibility, native API denial and exit; verify other-session independence and all write methods in integration tests.
