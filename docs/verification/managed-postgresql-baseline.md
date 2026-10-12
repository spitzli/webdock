# Managed PostgreSQL baseline — 12 October 2026

Historical production inventory from the start of implementation. No production changes were performed. Subsequent disposable CNPG/storage, lifecycle, migration and client tests are recorded in the adjacent pilot evidence files; see the [current operations runbook](../operations/managed-postgresql.md). The native production reservation read later succeeded using the direct endpoint with enforced read-only transaction; this historical snapshot is not a release approval.

Read-only collection: 2026-10-12T14:13:00.238671+00:00 through 2026-10-12T14:13:14.101724+00:00. [Allowlisted machine-readable snapshot](managed-postgresql-baseline.json). This is historical evidence, not a fresh admission decision.

## Live infrastructure

Target: Webdock cluster `102835722657992704`. Three Ready, schedulable, untainted nodes report `v1.36.5+k3s1` and `EtcdIsVoter=True`, without memory/disk/PID pressure. This verifies reported membership, not a quorum-loss/failover test. Flannel, portmap and bandwidth CNI plugins were observed on node 02. NetworkPolicy objects exist; packet isolation was not re-tested during this read-only collection.

cert-manager controller/webhook/cainjector images are `v1.21.2`. The hosting agent is active only on node 02; storage helpers are active on all three. The installed `storage.py` SHA-256 is identical on all three nodes: `32844f9cb71bad27a57d2f984b546c01667b58d5f9e4839ecad1bf6ee67d0a1e`. Full per-module hashes are in the snapshot. No CNPG or Barman CRDs were present.

| Node | Allocatable CPU (m) | Allocatable RAM (bytes) | Pod CPU requests (m) | Pod RAM requests (bytes) | Pool limit (bytes) | Journal allocations (bytes) | Filesystem available (bytes) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| wd-eu-01 | 5500 | 10669621248 | 10 | 67108864 | 130000000000 | 0 | 178570551296 |
| wd-eu-02 | 5500 | 10669629440 | 750 | 759463936 | 150000000000 | 1000000000 | 200549580800 |
| wd-eu-03 | 5500 | 10669596672 | 190 | 509607936 | 150000000000 | 0 | 201494470656 |

Pool ceilings total **430,000,000,000 bytes (430 GB)**: 130/150/150 GB. Each retains **20,000,000,000 bytes** host reserve. This supersedes the design’s old 100 GB snapshot. Exactly one 1 GB ready app volume is journaled on node 02. Journal identity matches each configured pool. Mount metadata was collected, but filesystem UUID/ownership validation and retained-backup accounting still need the storage qualification step.

No unassigned pod requests were observed. Some infrastructure containers lack CPU, RAM or ephemeral limits; the snapshot explicitly marks these dimensions as unbounded instead of describing their omitted limits as zero consumption. Pod requests are neither live utilization nor the control-plane promise to paused/retained resources.

## Budget arithmetic

| PostgreSQL resource | CPU (m) | RAM (bytes) | Filesystem (bytes) |
| --- | ---: | ---: | ---: |
| One Shared pool, at most eight logical DBs | 1,000 | 2,147,483,648 | 32,212,254,720 |
| Two dedicated Starter instances combined | 1,000 | 2,147,483,648 | 21,474,836,480 |
| One full Shared recovery pool | 1,000 | 2,147,483,648 | 32,212,254,720 |
| PostgreSQL-only peak | **3,000** | **6,442,450,944** | **85,899,345,920** |

This is **6 GiB RAM and 80 GiB primary/recovery filesystem space**, not 6 GB/80 GB. The eight 1 GiB Shared allowances are logical usage limits within the single pool; they do not each add a physical PostgreSQL process/volume. Dedicated recovery and import/export scratch must be added for whichever workflow is admitted.

Apply the existing 20% guard once to node allocatable. At collection, node 02 has 3,650m CPU and 7,776,239,616 bytes RAM remaining after current pod requests under that guard. Placing this entire PostgreSQL-only peak there leaves just 650m CPU and 1,333,788,672 bytes RAM **before** new operator, pooler, backup sidecars/jobs and import/export overhead. This arithmetic is not a qualified placement or a selling limit. Separate DB pools must be carved out of the shared physical ceiling; never add them on top of the already advertised app capacity.

The previously documented cluster promise is 13,000m CPU / 24,000,000,000 RAM bytes / 430,000,000,000 persistent bytes. A fresh attempt to read its current reservation ledger using the existing local Auth database configuration failed with PostgreSQL authentication code `28P01`. No credentials or query data were logged. The active/reserved/paused App and native Mail ledger is therefore **not verified**; no free commercial capacity or pilot approval is asserted. Concurrent reservation protection belongs to task 3 and is not proven by a snapshot.

## Admission and storage integration findings

- `webdock-application-safety` rejects automatic/projected API tokens outside `kube-system` and `cert-manager`. CNPG needs a narrowly scoped operator-owned DB namespace exception and independent restricted policy. Never exempt ordinary project namespaces.
- `webdock-service-safety` allows only ClusterIP outside `kube-system`; it currently forbids the planned PostgreSQL NodePorts. Known existing ports are 30344 and 31870 (Traefik). No PostgreSQL range has been reserved.
- Existing App admission additionally requires bounded CPU/RAM/ephemeral requests and limits, read-only root filesystems and health probes. Operator-generated Pods need compatibility tests against all of these rules, not only the token rule.
- The deployed helper includes the newer three-node storage router; the implementation worktree is based on older source. Preserve deployed routing, pool identities, journals, forced-command SSH configuration and current writers. Do not install the worktree’s old storage module over production.
- A nominal CNPG PVC size cannot satisfy enforced-volume acceptance. Missing image/mount/journal, filesystem ownership, ENOSPC and restart survival remain actual tests for task 2.

## Version and provenance checks

[Candidate pins](../../infra/postgres/versions.env) use registry manifest SHA-256 values independently recomputed from the returned bytes. [Signature verification evidence](managed-postgresql-image-verification.json) records verified claims.

| Component | Candidate | Result |
| --- | --- | --- |
| CloudNativePG | 1.30.1 | Image signature verified; Kubernetes 1.36 is in the 1.30 support matrix |
| PostgreSQL | 18.6, standard-trixie build 202610120828 | Image signature verified; PostgreSQL 18 is in the CNPG support matrix |
| PgBouncer | 1.26.0 | Image signature verified; runtime integration not tested |
| Barman Cloud Plugin | 0.15.1 | Digest resolved; Cosign returned `no signatures found` (exit 10) |

Verification used Cosign 3.1.3 with GitHub Actions OIDC and upstream repository identities. Its local binary matched the upstream GitHub release-asset SHA-256 `4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71`. No signature check was bypassed. The Barman result means provenance remains unverified through this method; it does not establish the absence of every possible upstream attestation. Plugin sidecar pins and the full combination remain unqualified.

Primary references checked on 12 October 2026: [CNPG supported releases](https://cloudnative-pg.io/docs/1.30/supported_releases/), [CNPG installation and verification](https://cloudnative-pg.io/docs/1.30/installation_upgrade/), [Barman requirements](https://cloudnative-pg.io/plugin-barman-cloud/docs/installation/), [PostgreSQL supported minors](https://www.postgresql.org/support/versioning/).

## Verification and next step

- New Python inventory tests: 7 passed, including GiB/GB, init/sidecar overhead, pod-level resources, pending/completed pods, missing allocatable, secret omission and unbounded limits.
- Existing hosting-agent suite: 57 tests ran, 1 skipped, no failures. The skipped case is `test_restricted_bootstrap_high_ports_and_permanent_credentials`, which requires the explicitly enabled local Docker Mail integration. No real-volume test is claimed.
- `npm test` could not start: this worktree lacks `apps/admin/.env.test.local`. No production database was substituted. No Next.js application code changed; no application build is claimed.
- Repeated live read-only collection succeeded, including remote reduction of pod objects before SSH transfer. No secret values or raw pod objects are persisted.
- Self-review only; the plan requires explicit user selection before delegation. Task 1 remains open for authenticated reservations, measured overhead, provenance and admission qualification.

Next: follow the [isolated qualification procedure](../../infra/postgres/README.md#next-executable-qualification-stage). No paid deployment, backup storage purchase or public DB endpoint is enabled by this change.
