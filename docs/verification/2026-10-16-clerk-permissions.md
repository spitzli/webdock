# Clerk organization permissions verification

## Behavior

Webdock now uses live Clerk membership permissions for project management,
deployments, database management and billing. Admin initially receives all four;
Member gains no additional rights. Native team rules, Mail administration,
operator authority, customer status, preview restrictions, managed/selfservice
limits and explicit website/database/mailbox grants remain separate.

Only allowlisted keys enter the Console principal and signed database proof.
Linked legacy sessions and claimed setup jobs revalidate the same authority;
unmigrated legacy organizations retain existing rules. Removing a permission
without changing the role removes its write authority on the next revalidation.
The bounded worker proof expires within 60 seconds. JWT permission fields do not
replace the live membership response.

Git source configuration and deployment actions have separate capabilities.
The database trigger limits deployment-only source updates to runtime pointers;
a narrow function permits invalidating obsolete builds after source changes
without granting deployment creation. Billing retains existing Admin read access,
with purchase, payment and change actions gated by the billing permission.

## Provider configuration

Development and production permission provisioning passed additive readback.
Production verified three current memberships; native Admin/Member permissions
were retained. No invitation, custom-role purchase or Clerk Billing activation
occurred. See `2026-10-16-clerk-permission-provisioning.md`.

## Database rehearsal

A fresh production backup was restored into an isolated PostgreSQL18 container.
The policy installer and its replay used a temporary NOSUPERUSER/NOBYPASSRLS
migrator. All 321 table content hashes/counts and 41 migration checksums remained
unchanged. All 317 selected tables retained enabled and forced RLS. Policy/function
fingerprints were identical after replay. Grant-preserving temporary-role
retirement was tested. Private backup and evidence are retained outside Git.

## Review and validation

Independent review found and corrected mixed migrated/unmigrated tenant navigation
and billing read compatibility. Restricted tests exercise actual Git, database and
billing writes under independent permissions, removal with unchanged roles,
cross-domain denial, stale/missing worker proofs and selected database/Git setup
requirements. Console navigation tests cover revoked Admin billing permission,
a Member with billing permission and read-only preview.



Final local checks: API and Console production builds passed; API 110 unit tests,
11 integration tests and 336 ported regressions passed. Four separately selected
RLS regressions passed. The full restricted Bun suite passed, including Clerk
SQL and worker assertions. Console 67 tests and compiled translation freshness
passed. Four RLS tests skipped by the ordinary ported runner ran in the restricted
suite instead. Independent security review has no unresolved blockers.

## Production rollout

Production policies were installed successfully for 317 FORCE RLS tables after
quiescing API and worker. Both services now run the verified immutable image
`docker.io/library/webdock-api@sha256:05459ef2b7e9ed2bd1aa8afe39f8911141e2b19b1d642e5af5369100af0c20fa`.
Both rollouts reached one ready replica.

Console deployment `dpl_8EwvggFvEiWRPxSJRMVgyruND9ey`
(`webdock-admin-9s6e3xkhe-spitzli.vercel.app`) reached Ready and the canonical
Console NGINX upstream was promoted after configuration validation. Auth upstream
and deployment-protection credentials were preserved; proxy rollout succeeded.

The temporary installer role is NOLOGIN, NOCREATEROLE, NOSUPERUSER and NOBYPASSRLS,
with zero memberships; its HBA entry was removed. Existing signing keys were
preserved. The real owner's existing Clerk session successfully loaded Customers
and the Projects home page (25 projects) on the canonical production domain.
A manually entered `/projects` URL returned the expected 404; the actual Projects
navigation targets `/`, which was reopened and verified. No customer impersonation
or production write smoke was performed; domain-write tests used isolated fixtures.
