# Clerk Organization Permissions Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent implementation tasks and a final integration review.

**Goal:** Use live Clerk custom permissions for projects, deployments, databases and customer billing while preserving existing default and resource access.

**Architecture:** Carry allowlisted live membership permissions in ConsolePrincipal and signed database proofs, including linked legacy and worker contexts. Service guards and domain-specific RLS policies consume permissions rather than treating an organization admin as blanket authority. UI receives derived capabilities.

**Tech Stack:** Existing Clerk SDK/CLI, Bun1.4.3, Node24, Next16.3.8, PostgreSQL RLS.

**Spec:** docs/superpowers/specs/2026-10-16-clerk-permissions.md

## Constraints

- Existing Admin/Member only; no paid custom roles or Billing activation.
- Preserve global operator, customer/resource isolation, explicit grants and preview restrictions.
- Live BAPI membership is authority; never role-derived fallback for linked users.
- API/worker remain on existing Kubernetes; preserve all live performance fixes and immutable image rollout.
- Exact production app/instance from prior release; no credentials in logs/Git.

## Tasks

- [x] Core: central permission keys, live extraction, principal/scope propagation, linked-legacy lookup and malformed/stale/role-unchanged revocation tests.
- [x] Hosting/databases: explicit action-domain mapping, service checks, management DTOs and setup/viewer revalidation; focused regressions for independently removed permissions.
- [x] SQL/billing: domain-specific permission helpers and policy gates, claimed worker checks, unchanged legacy fallback; actual restricted PostgreSQL tests.
- [x] Provisioning: inspect endpoints/roles, idempotent dry-run/apply script, additive Admin attachment and Member baseline verification; dev then production readback.
- [x] UI: server-derived capabilities for relevant navigation/actions; no permission gain from role labels.
- [x] Integration: unit/type/build/RLS/legacy suites, independent security review, PR, staged production rollout and live owner smoke. Document limitations without pretending customer impersonation tests ran.

## Review focus

Missing/empty permissions; unchanged role with removed capability; active-org and
customer mismatch; stale JWT vs live membership; setup/viewer revocation; legacy
protocol escape paths; SQL cross-domain writes; operator preview; additive provider
configuration retaining native System Permissions; rollback without stale role grants.
