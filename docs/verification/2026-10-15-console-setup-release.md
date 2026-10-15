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
