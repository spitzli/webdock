# Persistent app storage implementation plan

> Execute inline with `superpowers:executing-plans`. Preserve the existing uncommitted feature branch; no commits or PRs.

**Goal:** Fixed-size persistent app filesystems with retained-data accounting and separate administrator deletion.
**Architecture:** Extend the existing app spec and operation journal. The root-only agent manages preallocated ext4 images and owned static local PV/PVC resources; all public writes remain Webdock commands.
**Tech stack:** Node 24, existing TypeScript/Zod/PostgreSQL/Next 16 stack, Python standard library, Linux ext4/loop devices and Kubernetes.
**Spec:** `docs/superpowers/specs/2026-10-09-persistent-app-storage.md`.

## Global constraints

- Local disposable test DB/node only; no productive customer data or Lunares process changes.
- Existing uncommitted work is the baseline. No reset, commit, PR or remote build.
- One fixed `/data` volume, fixed creation size, at most one running replica.
- Preserve bytes and quota on app deletion; only the separate administrator command purges storage.
- English source and compiled German gettext; reuse existing UI/API/MCP services.

## Review focus

1. Stop/deletion must not free retained bytes: demand and operation integration tests.
2. Scale/rollback must not bypass one writer or change capacity: service tests.
3. Missing/mismatched image must never become a fresh empty filesystem: Python and remount tests.
4. Stale/foreign deletion must fail before filesystem changes: API, service and executor tests.
5. Missing mounts and partial creation must retain reservation and fail closed: storage tests and lifecycle verification.

## Tasks

- [x] 1. Contracts and control plane: add optional `volumeBytes`, `apps.storageDeletion` and `apps.purgeStorage`; retain byte accounting through stop/deletion; gate agent claims and completions on storage capability/proof. Files: hosting contracts, Auth hosting apps/operations/service and their tests. First assert `appDemand(spec, true).volumeBytes === spec.volumeBytes` fails, then implement. Run contract and disposable-DB Auth suites.
- [x] 2. Node storage: add `storage.py`, root-only configuration and mount recovery, static PV/PVC creation, retained app deletion and fenced storage purge. Extend executor/observer/daemon and agent bundle. First add tests rejecting second replicas, foreign ownership and missing images, then implement. Run Python suite and real local filesystem tests.
- [x] 3. Studio/API/MCP: persistent capacity field, retained app visibility, separate storage-deletion preview/form and REST/MCP mappings. Read installed Next docs, extend route tests, extract/translate/compile catalogs, run Admin tests and both typechecks.
- [x] 4. End-to-end verification: use the existing disposable local cluster and preview DB; verify capacity exhaustion, persistence/remount, restore, tenant denial, app-delete retention and admin-only purge. Inspect real T3 desktop/mobile pages. Record exact evidence and outstanding production activation steps.

## Execution ledger

Approved approach: file-backed storage. Native execution continues under the user's `go`; repeated design/worktree/commit approvals are unnecessary. Working in the existing feature checkout preserves the latest uncommitted hosting implementation, which a HEAD-only worktree would omit. Production activation is a separate final boundary after local verification.

Completed locally: all four tasks, 221 automated tests and both local production builds passed. Independent review findings corrected and verified; source remains uncommitted. Evidence: `docs/verification/2026-10-09-persistent-app-storage.json`. Production activation has not been performed.
