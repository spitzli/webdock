# Clerk Console implementation checkpoint

Date: 2026-10-15; release preparation updated 2026-10-16. Status: **implemented in the worktree, acceptance incomplete;
not ready for production activation**.

The owner approved the expanded API/RLS/viewer/worker scope in
`docs/superpowers/plans/2026-10-15-clerk-console-preflight.md`.

## Written

- Separate `/v1/console` bearer/service-key boundary with Clerk SDK session-token
  verification and live session, primary-email, mapping and membership checks.
  Console tokens cannot be sent through the legacy Studio transport.
- Identity/organization mappings, separate Clerk preview storage and explicit
  legacy-login eligibility. New invited-user projections have no local password
  account; legacy credential and session creation are denied for them, including
  password-reset credential establishment. Existing migrated users retain their
  separate legacy login eligibility.
- Signed request-scoped SQL identity and membership proofs. RLS recognizes Clerk
  without a Better Auth session, retains local operator/suspension checks and
  keeps expired preview restrictive. Linked legacy memberships use live provider
  proofs instead of stale local admin rows. No local membership mirror was added.
- Provider-qualified database viewer references retain the legacy session FK,
  reject absent/ambiguous identity and revalidate provider state. Setup workers
  revalidate stored provider references and require bounded signed authority.
- Business identity adapters, hosting dispatch, billing scope, registry scope
  inheritance and a separate internal Clerk lifecycle entrypoint. Legacy protocol
  entrypoints retain their token contract and MFA rules.
- Cookie-only Clerk verification for the fixed browser integration callbacks and
  preview forms, selected explicitly by deployment configuration. This is not a
  fallback for the service-key-protected business endpoint.
- Team service using the owner-approved native Clerk Admin/Member rules. A synchronous
  operator action creates/links a customer team and reconciles an interrupted
  creation using its stable slug and metadata. Unlinked teams show setup pending.
- Four-account/two-team importer at `apps/api/scripts/migrate-clerk-users.ts`:
  dry-run by default, explicit app/instance/database target, immutable mapping,
  duplicate-email refusal, preserved verification and suspension, no password
  import, and no invitation API calls. Reruns refuse to restore removed or demoted
  memberships on already-linked teams. Imported/projected users have provider
  self-deletion and organization creation disabled through backend user settings.
- Console login, invitation, profile, organization/user controls and access-pending
  page. `WEBDOCK_CONSOLE_AUTH_PROVIDER=clerk` selects the new deployment mode on
  Console and API. It has not been activated in a deployed application.

## Verification performed

All database work used the workspace-owned disposable Docker fixtures. No
production schema, accounts, memberships or deployed authentication were changed.
With separate owner approval, four temporary development test users and two test
organizations were provisioned using unique `+clerk_test@example.com` addresses.
No invitation emails were sent and no production data was used.

- Console tests: 62 passed.
- API unit tests: 90 passed.
- Full restricted-role API suite passed, including the new Clerk SQL/worker
  tests, existing registry/billing/setup tests and four ported database/mail RLS
  suites. The Clerk test covers stale legacy admin rows, demotion/removal,
  expired preview, identity CHECK constraints, local projection without a legacy
  membership, email collisions, and denied legacy credential/session creation.
- Legacy lifecycle regressions: 2 passed.
- Console and API builds/typechecks passed with Node 24.21.0.
- Console lint: no errors; one existing unused `_state` warning in product actions.
- `git diff --check` passed.

The automated tests are supplemented by the limited provider/browser checks below;
full acceptance and the real-user migration remain outstanding. The importer was
exercised with synthetic in-process provider fixtures.

Independent static reviews found and prompted fixes for stale legacy credential
flags, unusable-last-admin counting/row visibility, SQL CHECK null handling,
Clerk-only password-reset eligibility and migration reruns restoring revoked access.
A final incremental static review of native team policy, storage eligibility and
resource-level authentication found no new important regressions.

## Provider configuration and resolved policy decision

The development application remains `app_3KjGKUGb7dYUMgkjKC0eCWghnOB`, instance
`ins_3KjGKQnAATh2cA4ddJBR2cg3NXu`. A reviewed development-only configuration patch
was applied successfully:

- `auth_access_control.sign_up_mode`: `public` → `restricted`.
- `organization_settings.force_organization_selection`: `true` → `false`.
- `organization_settings.admin_delete_enabled`: `true` → `false`.

The API rejected removal of membership-management and organization-deletion
permissions from the existing standard Admin role:

```text
organization_missing_creator_role_permissions
The creator role must contain the following permissions:
org:sys_memberships:read, org:sys_memberships:manage, org:sys_profile:delete
```

After the owner signed into the shared Dashboard browser, the global **Allow
user-created organizations** switch was disabled and saved in the development
instance. The owner additionally requested Organization slugs; these were enabled
and saved. A full page reload confirmed `create_organization=false` and the
**Enable organization slugs** toggle on; the CLI read-back confirmed
`organization_settings.slug_disabled=false`.

The same restricted-permissions update was then retried against the existing
standard Admin role. It was again rejected with
`organization_missing_creator_role_permissions`. Disabling user-created
organizations therefore did not resolve the creator-role constraint in this
instance. No custom roles, paid features or weakened team invariants were silently
substituted.

The owner explicitly selected **Clerk native Admin/Member rules**. Webdock local
user/customer suspensions continue to deny business-data access. Direct Clerk
calls are governed by Clerk's rules: the extra local blocked-customer invitation
and last-locally-active-admin guarantees are no longer promised. The retired
`CLERK_TEAM_SELF_SERVICE_VERIFIED` gate and local last-admin enforcement were
removed. This resolves the provider policy blocker without custom/paid roles.

## Provider-backed acceptance in progress

The approved four temporary users and two organizations exist only in the selected
development instance; local mappings use the disposable RLS database. No Better
Auth accounts or sessions were created for them. Private fixture metadata lives in
the ignored task directory, not in this report.

- An unmapped signed-in identity reaches access-pending without business data.
- The temporary operator logs in through Clerk and reaches the registry with no
  organization membership or legacy MFA/password flags. Logout returns to login.
- Admin A reaches its own team with member management controls. Direct navigation
  to customer B's team returns 404 without foreign data.
- Member A signs in but has no team-management or invitation actions.
- Admin B reaches its own team; direct navigation to customer A returns 404.
- Logout and unauthenticated account/team navigation redirect to login. Protected
  pages now use resource-level Clerk checks instead of deprecated route matching;
  the business API remains independently authorized.
- Archiving the isolated customer B fixture immediately sends its still-signed-in
  Clerk admin to access-pending. Restoring the customer to active restores access.
  The fixture was restored; its provider membership was unchanged throughout.
- Clerk widgets now follow the Console locale (German/English).
- The storage administration gate accepts a verified Clerk operator while keeping
  the legacy credential checks for legacy users; the full RLS suite passed again.

## Remaining acceptance and rollout work

1. Complete direct Frontend API acceptance under the approved native team policy.
   Global user-created organizations are disabled and slugs are enabled.
2. Complete provider-backed acceptance of all business paths, particularly native
   mail/storage paths, timeout/rate-limit/partial-failure behavior and direct user
   deletion/leave flows. The known legacy-only storage/mail predicates have been
   corrected and covered by restricted-role regressions.
3. Review the private four-account inventory and target manifest. Verify the
   explicit instance belongs to the selected application through the CLI before
   running the importer. No real manifest or real dry-run report exists yet.
4. Run browser acceptance for all four identities, invitation/reset/logout,
   mobile navigation, multi-tab/stale-form behavior, preview expiry, callbacks,
   viewer access, team provisioning and provider failure/recovery.
5. Verify production entitlements, exact allowed origins and cookie isolation;
   rehearse membership-safe rollback, review the completed migration evidence,
   and wait for the owner’s return and confirmation of the production switch.

The implementation and temporary development fixtures are authorized. Production
cutover and the real-user migration remain separate rollout steps. The owner has
conditionally requested merge and deployment after returning and configuring Clerk
production; that condition has not occurred yet.

## Release preparation — 2026-10-16

The owner requested a PR against `main`; merge and deployment wait for their return
and production Clerk configuration. The [manual release/rollback guide](../architecture/clerk-console-release.md)
records exact runtime configuration, build-time public key handling, migration and
identity import order, safe rollback, and outstanding production acceptance gates.
No automatic deployment pipeline, merge or production cutover was performed.

Final review also prompted these corrections:

- Missing or mismatched Clerk issuer cannot fall back to stale local memberships.
  A real restricted-role regression exercises both identity and team mappings.
- The importer validates provider/database environment and public/secret key type,
  checks the publishable-key issuer, and requires the reviewed manifest environment.
  Application ownership remains independently verified through the CLI.
- Explicit mailbox grants can reference a Clerk identity and exact membership ID;
  local/provider bans, revoked membership, rejoining, unapplied revisions and worker
  access are covered. No shadow membership rows or operator escalation are used.
- Existing eligible legacy Mail grants are explicitly rebound during import,
  with revision reconciliation; disabled or otherwise ineligible grants are not revived.
- Setup revalidation uses a narrowly claimed-job SQL capability, not bootstrap DB
  credentials. A subprocess running the actual worker-only runtime exercises
  `runSetupBatch`, successful setup, provider revocation and identity mismatch;
  invalid generation/customer/stored identity and expired lease cannot read mappings.
- The full legacy suite exposed an existing Git rollback/retention race: rollback
  read artifact retention before waiting on the shared source lock. It now reads
  retention again after acquiring that lock, preventing a purged artifact rollback.
- The standalone SSO test command uses the existing `tsx` loader so extensionless
  TypeScript imports resolve under Node 24.

Fresh verification on the release branch:

- Console: 62 tests; production build and TypeScript pass; lint has no errors
  (one pre-existing unused `_state` warning in product actions).
- API: 92 unit tests pass; all native integration files pass. The complete ported
  suite reports 313 passed / 4 intentional RLS-only skips / 0 failures.
- Separate complete RLS suite passes, including actual worker-only setup execution,
  provider-qualified Mail grants and the four ported restricted-role SQL suites.
- Shared database runtime: 11 tests; hosting contracts: 23; SSO: 15, all pass.
- Guarded additive migration and checksum replay both pass on the owned local RLS
  fixture; policy installer reports 165 FORCE RLS tables. This is not a production
  backup restore rehearsal or a production migration.
- Changed-file credential-pattern scan found no private-key/token matches. Private
  runtime env, fixture metadata and provider keys remain ignored and uncommitted.

Production-specific browser acceptance and real identity inventory remain explicit
rollout gates in the release guide, not claims made by the local suite.


The first PR Console preview rejected a stale cached Tabularis package despite the
correct pinned archive. Console's Vercel install command now runs `npm ci` from the
repository root to replace cached dependency contents. The checksum guard remains
unchanged. The vendor-preflight regressions were rerun; preview status is checked
on the final PR commit.
