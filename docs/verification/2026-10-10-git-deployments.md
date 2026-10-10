# Git deployments: implementation and verification

Date: 2026-10-10. Working-tree implementation; no commit, push, production migration, provider publication or infrastructure purchase.

## Delivered code

- Customer-scoped GitHub OAuth, installation/repository intersection checks, encrypted short-lived flow credentials, exclusive installation ownership, repository IDs and generation invalidation. Existing operator metadata-only integration is preserved.
- Explicit PostgreSQL migrations, tenant foreign keys, bounded build queue, exact commits, duplicate webhook receipts, retry/backoff, worker generations, cancellation, approved releases, automatic publication policy, rollback and reconciliation.
- Shared authorized `git.*` commands through Studio, REST `/api/hosting/commands`, and MCP. Consent and worker credentials remain on trusted interactive/administrative paths.
- QEMU/KVM worker with disposable snapshots, restricted dependency proxy, bounded source/output/log/disk handling, host-side cancellation polling, tenant artifact storage and server-authorized retention/orphan cleanup.
- Dockerfile/OCI and pinned Vercel **63.1.2** production build recipes; provider credentials stay in trusted publishers. Container publication reuses the hosting app service and quota reservations. Registry pulls require installed, verified, repository-scoped read credentials.
- Vercel target binding verifies actual project/installation permissions, absence of native Git builds, Node 24 and Frankfurt configuration. Prebuilt-only publication uses an artifact-only workspace. Readiness requires provider observation, region validation and HTTP health; upload alone is insufficient.
- GitHub check outbox, bounded escaped build logs, setup blockers, English/German source/settings/history/approval UI, encrypted explicitly permitted build values and release pagination.

## Automated verification

All Node commands used Node **24.21.0**. Database suites refuse targets other than the configured disposable loopback `webdock_admin_test` database. No production database was tested or migrated.

| Check | Result |
| --- | --- |
| `npm run test -w @webdock/auth` | 117 passed |
| `npm run test -w @webdock/admin` | 106 passed |
| `npm run test -w @webdock/hosting-contracts` | 11 passed |
| `npm run test -w @webdock/i18n` | 11 passed |
| `python3 -m unittest discover -s apps/build-worker -p 'test_*.py'` | 35 passed |
| `python3 -m unittest discover -s apps/hosting-agent -p 'test_*.py'` | 28 passed |
| Auth/Admin `tsc --noEmit` | Passed |
| Auth/Admin Next production builds | Passed with local DB and fixture configuration |
| gettext extraction, compilation, `catalog:check` | Passed; 2,766 catalog messages |
| `git diff --check` | Passed |

Auth build used disposable test settings. Admin production build used non-routable `https://auth.example.invalid` / `https://studio.example.invalid` origins and the disposable DB. The initial attempt using local HTTP correctly failed the existing production SSO guard; no guard was relaxed. These builds establish compilation, not production connectivity.

Integration coverage includes migrations applied twice; tenant/scoped/preview denial; installation ownership; OAuth expired/replayed/cross-session/concurrent flows; transient token encryption/clearing; webhook HMAC; poisoned-event backoff; lease expiry/fencing; duplicate completion; concurrent approvals; explicit policy approval; encrypted build values; worker readiness spoof rejection through the actual HTTP handler; immutable publication identity; preflight versus ambiguous-write recovery; retained-artifact rollback; and concurrent rollback/retention serialization.

Provider tests use fake HTTP. Worker tests use fake commands and subprocess fixtures, **not a running customer VM**. The pinned Vercel package's official installed runtime selector was separately checked to resolve `24.x` to `nodejs24.x` without an experimental flag.

## Browser verification

T3 collaborative preview ran the real local Auth/Studio apps with disposable accounts and PostgreSQL fixtures created by `apps/auth/scripts/git-deployments-local-fixture.ts`.

- Tenant signed in through the actual SSO flow and opened project Git deployment settings/history.
- English and German rendered; repository names, branches, IDs and logs remained untranslated.
- At 390px mobile width, no horizontal document overflow; checkboxes use the existing `.check` layout.
- Failed build diagnostics retained compiler output. Injected `<script>` and `<img onerror>` strings appeared escaped inside `<pre>`; the fixture execution flag remained absent.
- Tenant approval changed the exact fixture release from `awaiting-approval` to `queued`, displayed success, and persisted `approved_by` in PostgreSQL.
- Operator signed in through real TOTP and opened the same source/history view. Switching to the real customer-preview mode displayed the read-only banner and removed every Git mutation control.
- Missing setup was visible. No local worker was run against the browser fixture, so approval did not publish anything.

The existing full Auth suite truncates local auth users/clients. Running it during the first browser pass invalidated that fixture's session; the fixture was regenerated after the final full suite. Run database suites **before** creating browser fixtures.

## Activation checklist — still outstanding

1. Apply `apps/auth/scripts/migrate-git-deployments.ts` using the existing explicit migration process and private deployment environment. Do not run it in request handlers.
2. Configure the Auth service's GitHub App ID/private key, client ID/secret, app slug, webhook secret and `WEBDOCK_GIT_STUDIO_ORIGIN`. Add Studio's `/api/hosting/git/callback` as an allowed callback without removing the legacy operator callback. Configure Auth's `/api/hosting/git/webhook` for required push/installation/repository-access events. Obtain installation-owner consent for Metadata read, Contents read and Checks write.
3. Provision or identify dedicated EU KVM build capacity, separate from application nodes. Follow `apps/build-worker/README.md`, prepare and pin the guest disk, independently validate isolation/egress/resource ceilings, and record provider location and storage/backup evidence. No such verification or purchase occurred here.
4. Enroll only after verification using `apps/auth/scripts/enroll-git-worker.ts` with an active secured operator session and evidence file. The command writes the credential to a new private file, never console output. The trusted administrative revocation procedure must disable the worker and advance its generation in `webdock_auth.git_worker`; no public enrollment/revocation endpoint is exposed.
5. Configure private EU registry/artifact storage, backups and retention. Set `WEBDOCK_GIT_REGISTRY_HOST`; canonical repositories are `<host>/customers/<customerID>/projects/<projectID>`. Install project-scoped publishing authfiles and read-only pull secrets in the application and validation namespaces. Configure the updated hosting agent and verify its registry capability/reachability.
6. For Vercel, use a deployment-capable customer connection or explicitly bound platform token/team/configuration. Bind the existing target through Studio; disable competing native Git builds and configure Node 24, Frankfurt Functions and no non-EU failover before binding. No customer connection is substituted with a global token.
7. Run the two real acceptance deployments: disposable container push → isolated build → OCI publish/pull → readiness/logs → deliberately failed healthcheck → rollback; and disposable Vercel EU-local build → prebuilt upload → provider metadata/Frankfurt verification. Exercise lost responses, cancellation and recovery with the real infrastructure.

The inspected private Auth env file lacked the new App ID/private-key/webhook/origin/registry/platform-publication keys. This was a key-presence check only; no secrets were printed. Other private configuration stores and actual customer permissions were not claimed verified.

## Operational limits

- Artifacts are private files on the verified EU build worker's storage. Publication/rollback is pinned to that worker/generation; losing it requires deliberate artifact/worker recovery. This is not a replicated artifact service.
- Retention preserves active/pending releases, the desired release and three recent healthy releases; eligible historical artifacts expire after 30 days. Disk admission and store ceilings fail closed. Orphan cleanup requires server confirmation.
- Interactive approvals are session-bound and may need renewal; explicitly enabled automatic publication revalidates the policy author and current project membership.
- Unsupported archive links, output formats and function metadata fail closed. Dockerfile dependency installation remains controlled by the repository; the Vercel recipe requires `package-lock.json` and `npm ci`.
- Vercel uses production-target values and verifies Frankfurt Functions, but its CDN/control plane remain global. No EU-only guarantee is made.
- Recreate remains the container strategy. No zero-downtime claim, database restoration, PR previews, ingress/TLS provisioning or versioned desired-state GitOps is included.

Live deployment/isolation acceptance is **not complete**. Passing fake-provider, database and browser checks does not satisfy those activation gates.
