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

## Backend rollout and remaining identity gate

The guarded production migration and policy installer completed successfully:
41 migration entries,317 selected tables under FORCE RLS. API and worker now run
`docker.io/library/webdock-api@sha256:568a3d4665d953a97f4c90d30e1232d28d3ffc348f98b44834e722cdc82b33f2`.
The imported image also needed its canonical digest name registered in containerd;
after that correction both workloads reached Ready with no restarts.

Clerk verifier settings and the Console delegation key are provisioned separately
on API/worker and Vercel Console. API remains in legacy Console mode until identity
linking completes. API readiness and legacy OIDC discovery return200; anonymous MCP
remains401. The existing immutable Console proxy target has not been changed.

The real importer dry-run identified exactly four accounts/two teams. Apply stopped
at the first provider user creation with Clerk422 `form_data_missing`, before any
new customer user or local Clerk mapping existed. Production now requires both
first and last name, while two legacy display names contain only one name. The owner
was asked whether last names should be optional or supplied explicitly. No names
were invented and no provider field requirement was silently weakened. The CLI now
reports only bounded provider/database diagnostic codes, never raw secret-bearing
error details. Runtime and source checks remain green.

The temporary non-superuser migrator was disabled, its password cleared, all role
memberships/database grants removed and its temporary HBA rule removed while that
decision is pending. Merge, final identity import, Clerk Console activation and UI
proxy promotion are still outstanding. No invitation emails were sent.


## Identity import completed

The owner explicitly approved placeholders for the missing surnames. The private
manifest supplies `—` for the two incomplete names and explicit first/last names
for the existing full name. Clerk's required-field configuration remains unchanged.
The importer accepts only explicitly reviewed name fields; it does not infer surnames.
Nine importer regressions and API TypeScript passed.

Production import completed:four local identities linked, two Clerk customer
organizations created/linked, existing roles preserved without adding the operator
to customer teams. No invitations, passwords or legacy sessions were created.
The schema has no native mailbox grants to convert. Console activation and promotion
follow final mapping readback and removal of the temporary import credential.

## Public Console promotion

PR #33 merged as `dcd18806350d9e83eda9db4b65d866ed630bf877`. Final importer
readback reports all four identities and both teams unchanged; the dedicated import
role is NOLOGIN with no memberships and its HBA entry removed. API and worker run
with Clerk Console mode enabled. The public website now contains both waitlist links.

Console production deployment `dpl_J6CqWzxarvwhs7Jiy9faihc1PH2C`
(`webdock-admin-p4qomkl5r-spitzli.vercel.app`) reached Ready. The NGINX configuration
was validated before changing only the Console upstream; Auth's immutable upstream
and both protected-deployment credentials were preserved. The proxy rollout passed.

Live navigation exposed one ingress-specific entry issue: `/api/sso/login` is sent
to the API directly, bypassing Next.js proxy logic. The targeted follow-up redirects
only Clerk-mode Console GET/HEAD login entries to the fixed `/login` URL, after the
foreign-origin check. Legacy mode, callbacks and signed API requests remain intact.
Regression reproduced the old route, then103 API unit tests and TypeScript passed;
independent review found no blocker. Direct `/login` already renders the production
Clerk sign-in and waitlist entry. The follow-up API image is promoted separately.
