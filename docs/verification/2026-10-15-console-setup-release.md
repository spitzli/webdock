# Console setup release — 2026-10-15

The release integrates current `main`, the project setup feature and the already-deployed managed database viewer/navigation fixes. The public setup guide follows the new English Mintlify structure at `/guides/project-setup`.

## Preflight and corrections

- A fresh disposable database exposed a missing composite hosting-project index before service bindings. The schema builder now creates that index before the foreign key.
- Initial RLS installation already defines setup helpers; the unreleased 0028 migration now safely replaces them. Existing deployed migrations, including `0022_managed_database_viewer.sql`, keep their names and checksums.
- A non-superuser migration regression reproduced failure to backfill the seven existing Git releases under FORCE RLS. Migration 0022 temporarily relaxes FORCE only on its three history tables under transactional DDL locks and restores the original flags before commit. The regression verifies preserved history and restored FORCE flags.
- The production restore rehearsal exposed premature revocation of schema CREATE inside the setup helper block. Schema privilege lifetime now remains owned by the enclosing offline installer, which revokes it at the end of its transaction.
- A private production backup was restored into an isolated PostgreSQL 18 instance. Existing row counts across 312 tables were preserved. All migrations, checksum replay and RLS policy installation were exercised, including the dedicated non-superuser migrator.

## Verification

- Console: 56 tests; TypeScript and production build passed.
- API: unit/native integration checks and 313 ported tests passed; four RLS-only tests were separately exercised. Full RLS suite passed.
- Hosting contracts: 23 tests; hosting agent: 79 tests with one existing skip; build worker: 52 tests.
- Mail OpenAPI export matches source; Mintlify build validation and broken-link checks pass.
- Existing production database-browser API and Console behavior are preserved by integrating commits `32fe83c` and `4274327`.

Production rollout evidence is appended after the guarded migration and workload checks complete. No real Mail delivery or customer data mutation is part of the smoke checks.

## API and agent rollout

- API and worker now use `docker.io/library/webdock-api@sha256:6c5b34663c397e4e9793935efe73afb84b6435a858c3d9dafdea6fcfba39d7cf`; both deployments report ready. The image overlays the verified existing production runtime with the merged API/workspace artifacts; dependencies and existing database-viewer fixes are preserved.
- Production now records 36 checksummed migrations. All seven historical Git releases retain non-null source identity. FORCE RLS remains active on Git history, setup and binding tables.
- The migration ran in an isolated non-root Kubernetes job with an explicit database target, verified CA, restricted egress and a temporary non-superuser account. The worker paused briefly to fit the existing platform resource quota, then resumed with `billing,storage,hosting`. The public API stayed available during migration.
- The database sees NodePort clients through its cluster gateway; the temporary HBA entry was corrected to that observed source. The job, secret, network policy, HBA entry and temporary role were removed afterward. The original website-browser ownership membership was retained through a permanent root-issued grant.
- Setup is enabled on API and worker. Worker receives only the required GitHub/database configuration references in addition to its existing restricted worker credentials. Existing encryption and context-signing keys match and were retained.
- Native application Mail egress is configured to the existing HTTPS API at `api.webdock.dev`, restricted to its exact IPv4 host. This does not activate incoming Mail, create provider accounts, place paid orders or enable previously disabled native sending workers.
- Both existing hosting agents advertise service-binding version 1 after a guarded update. Original agent directories remain available for rollback; the database host retains its existing HTTP01 resource allowance and other host-specific modules.
- Public API readiness returned HTTP 200 after rollout. Git build capacity, registry project authorization, database offers and Mail sender verification remain checked per setup; the feature does not bypass missing prerequisites.
