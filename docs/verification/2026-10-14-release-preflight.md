# API release preflight — 2026-10-14

PR: https://github.com/spitzli/webdock/pull/18. Project relocation and its MCP fix are included with owner approval. Production cutover is **not complete**, and the PR must remain unmerged until the API is ready: merging automatically publishes the Vercel frontends.

## Verified changes

- Catalog MCP supports listing, drafting, explicit publication and archival. Real constrained-role integration tests cover current operator/MFA authority and OAuth write scopes (10 assertions); HTTP MCP scope/revocation tests pass (11 assertions).
- An unconfigured, empty billing catalog performs no provider operation and needs no Polar credential (2 assertions). Live products and prices have not been created.
- Auth/Studio typechecks pass. Vercel previews for `d6017aa` are green. An actual protected Auth preview rejected the canonical origin before the exact-host Server Actions configuration. Afterward, the canonical origin reaches action lookup (404 for the intentionally nonexistent action); an unrelated origin still fails CSRF validation (`E80`). No wildcard origin was added.
- API image `webdock-api:d6017aa` was built and imported into the existing API-host k3s image store. Import index digest: `sha256:5d4670670d1c6ceda9b79198372b7be22c45b7dac1dc7049821716313acf8429`. No API/worker workload or traffic route was started.

## Database rehearsal and attempted preparation

The selected production database was backed up and restored into an isolated owned PostgreSQL18 container. All 20 additive migrations preserve existing row counts across 294 existing tables (310 afterward). Strict API readiness passes against the restored schema and constrained roles. No API/worker was started against the restored customer data.

A subsequent rehearsal using a dedicated **non-superuser** offline role found that transferring website table ownership temporarily requires schema CREATE permission for the platform owner. The installer now grants that permission only inside its transaction and revokes it afterward. The non-superuser rehearsal and strict runtime readiness pass. An intentionally held table lock makes installation fail immediately with `55P03`, before changing grants; this avoids mid-installation lock upgrades against an active old writer.

Production preparation created a new restricted registry login without rotating an existing password. The CloudNativePG controller briefly rejected the HBA change while restarting, then recovered without operator configuration changes. HBA now permits the registry login. Policy installation attempts rolled back fully (initial privilege failure, then concurrent-access deadlocks); production API migrations were not applied. The temporary offline login is disabled, its password cleared, CREATEROLE and all memberships revoked, and its HBA entry removed. Existing production routes and workloads remain active.

## Remaining cutover prerequisites

Unmasked production integration settings are still required. Current and historical Vercel exports contain `[SENSITIVE]` for the GitHub App/OAuth/webhook credentials, Git Vercel credentials, Vercel integration credentials and database-gateway credential, plus several associated selectors. No masked value was installed as a runtime secret. Better Auth encryption and signed-RLS keys have been verified against production; the existing SSO credentials and a local production Mail-key source were found. No existing key was rotated.

After obtaining the existing integration settings: prepare separate Kubernetes runtime secrets, drain the old writers for the offline migration, apply migrations/policies, revoke the dedicated migrator, deploy and verify API/worker/TLS/ingress, then merge and verify the Vercel production frontends. Transfer scheduler ownership explicitly. Live Polar onboarding/product publication remains a later step after the owner configures the production key and product terms.

Sensitive backups, credentials and operational logs remain in ignored private files, not this report or the PR.
