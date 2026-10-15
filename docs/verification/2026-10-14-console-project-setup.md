# Console project setup — verification, 2026-10-14

Implementation branch: `t3code/console-container-setup`. Specification: [approved design](../superpowers/specs/2026-10-14-console-project-setup-design.md). Usage: [application setup](../guides/project-setup.mdx).

## Delivered behavior

- Project overview and four-stage setup: source, application, services, review. New projects lead into setup; existing Vercel projects retain their deployment lane.
- Multiple independent application Git sources, root directories, builds and releases within one project. Backward-compatible single-source reads; ambiguous calls require an explicit application.
- Durable encrypted drafts, bounded source inspection, GitHub OAuth continuation, exact SHA/offer confirmation and resumable leased execution. Saving never provisions a runtime or accepts an order.
- Real service bindings: PostgreSQL application credentials with `sslmode=verify-full`, mounted CA and scoped cluster egress; native Mail sending-only, domain-restricted keys with configured exact-host egress. Outgoing-only never provisions Stalwart.
- Explicit service disconnection and Mail rotation. Observed revisions determine readiness. Deactivation preserves data; deletion remains separate.

## Executed checks

Machine-readable evidence: [verification results](console-setup/evidence.json).

All commands used Node 24.21.0 and disposable loopback PostgreSQL fixtures. The API runner uses its pinned Bun runtime. No production migration, paid order, external email or live provider deployment was performed.

| Check | Result |
| --- | --- |
| `npm test` | 55 Console tests passed, including source defaults, consent, secret redaction and English/German backend-error coverage |
| `npm run test -w @webdock/hosting-contracts` | 23 passed, including initial replicas > 0 and exact source identity |
| `npm run test -w @webdock/i18n` | 11 passed |
| i18n extraction, compilation, `catalog:check` | Passed |
| API and Admin TypeScript checks | Passed |
| Admin production build, including TypeScript validation | Passed |
| Admin ESLint | No errors; one pre-existing unused `_state` warning in admin/products/actions.ts |
| `npm run test:api` | 62 unit + 10 native integration + 312 ported checks passed; 4 RLS-only checks intentionally skipped here and passed in the separate RLS run |
| `npm run test:rls -w @webdock/api` | 24 restricted-role checks passed; the subsequent focused run also verifies the added tenant-role draft repair (25 distinct checks overall) |
| `python3 -m unittest discover -s apps/hosting-agent -p 'test_*.py'` | 79 tests, one pre-existing skip, no failures |
| `python3 -m unittest discover -s apps/build-worker -p 'test_*.py'` | 52 passed; existing ResourceWarning output |
| `git diff --check` | Passed |

Tests sharing the same disposable API database were finally run serially. An earlier overlapping focused run caused a fixture DDL deadlock in the unrelated tenant-mail test; that failed run was not treated as acceptance.

### Complete-flow evidence

- Actual password/MFA login, OAuth/SSO delegation and signed-in Console against the local restricted-role API. T3 shared browser covered saving, source selection, Enter navigation, input persistence, secret redaction, review and explicit deployment. After the desktop automation host disconnected, local Playwright continued with the same authenticated fixture.
- A real immutable healthcheck container was launched in local Docker by the fixture agent after the real setup worker created the operation. It returned HTTP 200 and the persisted setup reached `ready`. Container used UID 65532, read-only root, dropped capabilities and no-new-privileges. This is **Docker fixture evidence, not a Kubernetes rollout**.
- Desktop and 390px mobile views rendered in German and English; no page errors or horizontal overflow. Back/forward step navigation retained the application name and saved step URLs. Project overview displayed the observed ready application.
- Actual database offer/acceptance fixture plus setup preview proves missing price consent cannot create an order. A supported immutable-image setup connects an existing ready database, carries TLS settings in its private agent packet, observes binding proof and reaches ready without another order. The database order and binding tests exercise transaction replay, credential changes, foreign tenants, read-only actors, retention and agent ownership.
- Native Mail fixture verifies key permission/domain restriction, interruption replay, rotation/revocation, collision rollback and absence of additional Stalwart instances. No external Mail was sent.
- Git fixture verifies two independent sources and publication identity. New setup-retry integration reproduces the old retained-build bug, creates a new build for the original reviewed SHA even after branch advance, follows a fresh release and observes application readiness without replacing the application. Provider/build/publication results in this test are bounded fixtures, not a live GitHub build.
- Restricted worker test starts with only `DATABASE_WORKER_URL`, advances setup, rejects stale lease generations and actor mutation, and observes readiness. Existing RLS suites cover tenant, key, Mail, agent-cluster and database boundaries.

Screenshots: [project overview](console-setup/overview.png), [ready progress](console-setup/progress.png), [German review](console-setup/review-de.png), [mobile review](console-setup/review-mobile-de.png), [mobile source selection](console-setup/mobile.png).

## Review and regression fixes

One fresh-context independent reviewer examined `dbfc4c4..c1eb5bc`; no Critical or Minor findings, three Important findings. All three were addressed in one fix pass:

1. Terminal Git release failures reset build/release progress, retaining reviewed SHA and existing resources. `needs-reconciliation` still requires reconciliation. GitHub Actions replacement selection excludes terminal releases. Integration test fails against the original reviewed implementation and passes after the fix.
2. Preview detects all manual/managed and managed/managed variable-name collisions before confirmation. A blocked binding draft can repair only its manual environment; it cannot change source, accepted costs, resource identity or already-managed variables. Tests verify both encrypted stores, retained app identity and denied mutation paths.
3. Stopping/scaling to zero does not require healthy dependencies. PostgreSQL pause and revoked Mail-key tests preserve binding metadata while active deployment remains fail-closed.

An additional contract regression prevents an initial zero-replica setup from waiting forever for readiness. Existing deployed applications can still stop or scale to zero.

## Migration and activation

Migrations `0022` through `0035` are additive and run through the existing offline transaction/checksum migration runner. They include per-target Git identity/history backfill, draft lifecycle, bindings, setup journal/ownership/leases, OAuth continuation and redacted capability helpers. The populated Git migration regression preserves source/build/artifact/release identity, supports independent publication and rejects cross-owner history. The local RLS fixture applied all migrations and regenerated policies successfully; repeat migration checked existing checksums. This is not an upgrade rehearsal against a copy of the production database.

For an operational rollout:

1. Use the existing dedicated offline migrator with verified database CA and exact `host:port/database` argument to `apps/api/scripts/migrate.ts`; install the updated RLS definitions using the existing platform installer. Keep runtime roles unprivileged.
2. Roll out the matching API/worker and hosting agent. Confirm agent capability `serviceBindingsVersion: 1`, environment support, current capacity/heartbeat, and managed registry support for Git images. Preserve existing Mail encryption keys, volumes and replica ownership.
3. Enable `WEBDOCK_SETUP_ENABLED=true` on API and hosting worker, and include the `hosting` worker domain. Sessions remain actual authenticated sessions; expired/revoked authority blocks execution until a permitted user signs in and resumes.
4. Configure verified build capacity, GitHub App/registry storage and project image entitlement where Git/custom images are needed. For Mail, configure HTTPS `MAIL_API_ORIGIN` and exact approved `/32` or `/128` hosts in `WEBDOCK_APPLICATION_MAIL_EGRESS_CIDRS`. No unrestricted Internet rule is generated.
5. Run a separately authorized Kubernetes canary for PostgreSQL TLS/CA rotation, egress, key rotation and actual native delivery before enabling those paths broadly. Confirm the available database offer, backup status and customer consent; tests do not establish a production backup SLA.

## Decisions and remaining boundaries

- Existing single-source callers remain compatible; multiple targets require a selector. Changing source target identity creates a new source rather than retargeting historical releases.
- Drafts keep revision 1 for first deployment and consume no runtime quota. No placeholder container is created.
- PostgreSQL uses the direct internal hostname covered by the existing server certificate, not the pooler; automatic pooling is not supplied.
- Steps/resources share one leased setup row; execution is sequential, not concurrently scheduled per step.
- Worker authority is signed, leased and scoped to the actual saved session. It does not impersonate an unrestricted operator; session expiry can interrupt a long-running setup.
- Uncertain writes retain existing reconciliation fences. Terminal Git failures can rebuild, while uncertain publication cannot silently issue a replacement write.
- A saved Git draft may precede OAuth. Preview/execution still require a complete verified repository identity.
- Setup history blocks destructive CMS project deletion before remote side effects. Archive remains available; retained services are not silently erased.
- Only supported immutable cached/managed-registry images are accepted. Arbitrary tag resolution, registry credential imports, custom Dockerfile paths outside the selected root, background-only workers, `webdock.yaml` and preview environments are outside this delivery.
- Redacted capability helpers preserve agent/worker credential isolation. Mail requires an operator-configured network route and a verified domain; it is not automatically usable on an unconfigured cluster.
- After provisioning, configuration/cost/resource choices remain immutable within setup. Application/service settings handle later changes; narrowly scoped manual-variable correction is available for a blocked binding draft.
- Integration coverage composes existing database/Mail/Git fixtures and new setup cases rather than duplicating the complete infrastructure harness. A single live Git + paid database + Mail delivery run was not performed.
- The reviewer declined live infrastructure, final migration acceptance and duplicate browser/suite execution; the executor completed local verification as described. Live Kubernetes connectivity, real GitHub consent/build publication, delivery and production activation remain operational verification work.

No minor review findings were deferred. Local work remains on the feature branch; no production merge or deployment was performed.
