# Global authorized view caching — 2026-10-15

Production now uses Dragonfly for Console directory and overview reads. The route-family inventory, dependencies, TTLs and deliberate live-only boundaries are in [cache-policy.md](../architecture/cache-policy.md). This release changes the API; the previously deployed Console and Viewer remain in place.

## Behavior

- Customers, projects, CMS registry metadata, activity, operator directory, tenant navigation and plan catalog use authorized views with a 60-second storage lifetime. Project listings use 30 seconds, Operations 15, project overview 10, and cluster health 5.
- Keys separate deployment/release, authorized scope, normalized query and database source revisions. The Kubernetes ReplicaSet hash supplies `VIEW_CACHE_RELEASE` automatically.
- Transactional statement triggers on 24 source tables invalidate after committed writes, including worker and direct database writes. Rollbacks do not invalidate; reads of a transaction's own uncommitted source changes bypass caching. Late commits and delayed fills cannot make an old revision current.
- The append-only revision ledger avoids shared writer counter locks. Cleanup deletes bounded batches and rotates epochs atomically every minute, even if shared caching is disabled. Production check: 65 events, none older than six minutes.
- Session/security/resource authorization stays live before a hit. SQL results, credentials, mutation decisions, billing admission, CMS editor data and external provider state are not blanket-cached. Registry retains its live final operator check.
- Cache IO has a 100 ms deadline, a 10-second outage circuit and fresh database fallback. Errors and sensitive DTOs are excluded, with a 512 KiB value limit. Missing revision schema or missing production release disables shared caching; database revision failures propagate.

## Validation

API unit tests: 71 passed. Integration tests: 11 passed. Ported regression suite: 336 passed, zero failures, four restricted-role tests skipped in that suite. The changed registry cache path and existing registry integration were also tested separately with real restricted PostgreSQL roles. The six ledger tests cover committed writes, rollbacks, out-of-order commits, pruning, own-write bypass, deletion/truncation and opposite-order concurrent writes. Plan and navigation tests cover warm hits and revoked access.

Build/typecheck passed. After the final cleanup-timer adjustment, real network startup and native Auth UI integration passed again. Real disposable Dragonfly 2.0.2 verification passed authentication, eight simultaneous cold keys, hit reuse, revision invalidation, TTL expiration and bounded outage fallback. `git diff --check` passed.

Production readiness returned 200, Dragonfly returned PONG, the release environment matched pod label `5b5779d9cd`, and startup/maintenance emitted no `view_cache_*` warnings. Six authenticated Customers/Operations reads produced two misses and four hits in Dragonfly. Operations returned the identical `readAt` on all three immediate requests, proving snapshot reuse. Navigation, plans, clusters and populated project queries also returned 200 twice each.

| Browser measurement | Observed time |
| --- | --- |
| Customers API, three sequential requests | 483 / 488 / 392 ms |
| Operations API, three sequential requests | 397 / 317 / 327 ms |
| Projects registry, cold / warm | 599 / 360 ms |
| Customers → Operations, click until populated table | 996 ms |
| Operations → Customers, click until populated table | 1,207 ms |

These are individual authenticated browser samples, not a controlled performance benchmark. Live authorization, network and rendering still contribute to page latency. The cache's verified benefit is skipped repeated data reads with correct invalidation; no claim is made that all page load time disappeared. Exact redacted measurements are in the adjacent JSON file. No production customer records were modified for verification.

## Deployment and recovery

- API: `docker.io/library/webdock-api@sha256:ed1c4e336ce2b866c0ef233de271d0fae3fb455ed449c08a80501857098d986b`.
- Prior API: `docker.io/library/webdock-api@sha256:26a0ca2066c02655bbc2e1bbde27c0aa8169436578b950ab916e17f15da8ec78`.
- Migration `0036_authorized_view_cache.sql`: SHA-256 `5b88d73572557d2256ede98224a6a3a59a5dade26019dbdf9fb968f4cb84b997`, applied in a guarded transaction and recorded in the migration journal. All 24 sources have four enabled statement triggers. Runtime-role metadata write denial and version/prune privileges were verified.
- Schema backup and private release/test logs: `/home/newt/.cache/webdock-cache-strategy-20261015/`. Schema-backup SHA-256: `a9dd946e875f2032d96d7a9350d5e3ea82b7a348a22d72b6f9ca22dcebbc93ae`.
- Built locally on the already deployed API image, overlaying the changed runtime files. Existing invitation mail delivery fixes and SMTP port 587 were retained. Image imported into the existing EU k3s node; deployment used guarded resource-version/image checks. No new infrastructure or cross-region migration.

Disabling `VIEW_CACHE_URL` bypasses the data cache while retaining revision cleanup in this image. Rolling back to the prior image remains schema-compatible; leave migration 0036 installed. A prolonged rollback needs periodic `webdock_cache.prune()` maintenance with the authorized bootstrap role because the old image does not schedule it. Do not remove the migration journal entry or replay a modified checksum. No commit or PR was created.
