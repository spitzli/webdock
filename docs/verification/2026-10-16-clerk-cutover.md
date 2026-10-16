# Clerk production cutover — 2026-10-16

The owner returned, configured production Clerk, and requested release. PR #33 is
based on the existing app; production instance is
`ins_3Klz8x6R4XYa8w6QfjPQl95EKZf`, issuer `https://clerk.webdock.dev`.
The app/instance relationship was verified through the Clerk CLI. Waitlist is
active, user-created organizations are disabled, slugs enabled and org selection
optional. The first operator identity has completed email verification.

## Production prerequisite reconciliation

Read-only artifact comparison found that the running API includes the deployed
performance/cache/invitation fixes from `performance-20261015`, absent from GitHub
main. Every running API source file matched that worktree byte-for-byte. Those
changes and their frontend/vendor counterparts are incorporated before the Clerk
cutover; the original worktree remains untouched. Existing SMTP587, pool limits,
cache release identity, database-viewer behavior and invitation handling are retained.

Clerk and linked-legacy views bypass shared data caching: provider membership
changes do not appear in the SQL revision ledger. Authorization remains live.
The navigation cache has a distinct DTO version to avoid reading pre-cutover
entries without organization identity. Original cache migration0036 retains its
name and checksum. Migration filenames, not numerical prefixes, identify journal
entries; both0036 files remain unambiguous.

The private inventory confirms four existing identities and two customer teams
(schattenclan/tabularis). Legacy operator owner rows are preserved locally but are
not imported as Clerk team memberships. The importer now validates only customer
members against the reviewed team manifest. No invitation emails are part of import.

## Restore rehearsal

A private PostgreSQL18 backup was restored into a separately labeled local
container. A dedicated non-superuser,NOBYPASSRLS migrator applied migrations,
installed policies and replayed both successfully. All318 original table row counts
were preserved except the migration journal (37→41). All37 original checksums and
96 cache invalidation triggers remain unchanged. All317 selected tables have FORCE
RLS. Production's optional native-mailbox tables are absent; migrations/importer
now explicitly tolerate that state and do not provision Mail as a side effect.

Backup SHA-256: `2250a4a0644e6a98ebdfaa36df98da0fa2081d7a8c3a87c33fd2dbeca917f86d`.
The backup, manifests, credentials and detailed inventory are private and ignored.

## Integrated verification

- Console:67 tests and production build passed.
- API:101 unit,11 integration and336 ported tests passed; four RLS tests are
  deliberately separate from the ported suite.
- Restricted RLS:25 Bun tests across23 files plus four Node SQL tests passed.
- Hosting contracts:24 tests; SSO:16 tests; API TypeScript/build passed.
- Optional-Mail/importer regression:8 tests; installed vendor archive/tree guard
  passed after a clean dependency installation.
- Independent integration security and migration review found no remaining blocker.

Current API/worker image references, immutable frontend routing and workload
configuration were captured privately before changes. Actual rollout and smoke
results are appended after completion; the above is preparation evidence only.
