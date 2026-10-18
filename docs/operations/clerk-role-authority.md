# Clerk role authority — rollout boundary

User requested Better Auth local by default, with Clerk owning roles/memberships when selected. Development changes are in the existing t3code-165bd297 worktree. Do not deploy its unrelated dirty changes wholesale.

Global operator authority is live Clerk Backend User.privateMetadata.webdockRole === "operator". A missing/unknown value means user. Org roles/permissions are live Clerk Organizations; custom org roles project to member unless exact org:admin. No local role or membership fallback is allowed for selected Clerk. Better Auth remains local even if Clerk mappings are retained.

Before production switch: inventory actual intended operators, verify the correct issuer/account IDs and explicit local mappings, and deliberately assign Clerk private metadata roles through the administrator channel. No production roles or auth mode were changed by this work. Apply the matching offline RLS changes and API/worker/Console builds together; new signed scopes carry authProvider and current provider operator/MFA proof. Fail closed on missing proof rather than relying on old user.role columns.

The owned Clerk development smoke script tools/tests/clerk-role-authority-live.ts uses an exact development issuer and sk_test/pk_test credentials. It verified live metadata promotion/revocation, ignored public/unsafe/local roles, live organization downgrade/removal and session revocation. It uses a synthetic local mapping and a server-owned provider session reference, not a browser login. Both remote test resources were removed. Private development keys must not enter Git.


## Verification completed

Final product-free Core build, API/Console typechecks, 185 API unit tests, 16 Clerk adapter tests, 84 Console tests and independent security review pass. Real PostgreSQL regressions cover native/legacy roles, workers, mail, previews, tenant membership without local rows, explicit billing permissions, and direct OAuth registry authority. The normal Better Auth/OIDC path remains tested. See verification/2026-10-18-clerk-role-authority.json for precise boundaries and unrelated full-suite fixture/CMS failures.

The offline helper is now setup_legacy_revalidation(issuer text), and signed scopes include the chosen authProvider. Coordinate worker/API/SQL versions; do not roll out a partial mix. Local Better Auth management endpoints are disabled under Clerk even if OAuth compatibility is enabled. Global Clerk operator assignment remains deliberate administrator metadata configuration before the switch.

Owned development Clerk resources and temporary keys were removed. The owned PostgreSQL fixture was returned to its original stopped state. Core/auth changes remain in the existing working tree; no production auth switch, role grants or database migration were executed.


## Documentation signing checkpoint

The updated public auth-adapters page is staged in /tmp/webdock-registry-docs-release on docs/clerk-role-authority. Mintlify build/link checks and independent review passed. After the user unlocked 1Password, a bounded normal attempt timed out and the interactive retry returned `1Password: agent returned an error`. No commit/PR/push was created for this documentation change; configured signing was not bypassed. Resume by signing that staged docs-only change, then push/PR/publish. The code and complete test evidence are saved in the primary worktree.


## Documentation publication completed

After the authorized full 1Password restart, one controlled signing attempt succeeded. Signed docs commit 46c58b204499d886e739e7b278aa329491bba405 was pushed; GitHub verified its signature. PR https://github.com/spitzli/webdock/pull/41 merged as c7dfe43848abb78ba2172055cb638b57797c86ef. The live auth-adapters page contains the new role-authority section and retains the explicit implementation-preview boundary. Core/auth code remains locally implemented/tested; no production auth provider, roles or RLS were changed by this publication.
