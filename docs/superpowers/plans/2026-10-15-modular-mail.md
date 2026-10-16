# Modular Mail implementation plan

**Goal:** Introduce a shared installation registry and extract the first Mail module and turboSMTP adapter without changing resource IDs, protocol URLs or the existing authorization rules.

**Architecture:** The supplied architecture is the approved direction. The current tree already has a Bun API, PostgreSQL registry, separate Mail contracts/core and a vendored Tabularis UI. Preserve these newer changes. Compose static modules in the API; expose the resulting public state to the Console through its authenticated Studio session. Deployment domain ownership remains independent of installation activation.

**Execution:** Inline in the existing isolated worktree, as requested. No deployment, provider provisioning or publication.

## Constraints

- Node 24 for Node commands; existing Bun API and npm workspaces/lockfile remain.
- Existing Better Auth session verification and local access checks remain authoritative.
- Keep Stalwart isolated per explicitly enabled customer, retained storage and encryption keys.
- Runtime configuration is server-owned; no NEXT_PUBLIC module selection.
- No migrations or tests against live customer data.
- API orchestration tied to authentication/database/hosting stays in the composition app until those core contracts are extracted; do not introduce reverse imports from modules into apps.

## Tasks

- [x] Add a dependency-free SDK registry: strict versioned config, manifest/dependency validation, enabled/draining/disabled states, public view, slot filtering, actionable errors. Test unknown input, dependency cycles and disabled modules.
- [x] Register Mail with a static manifest, its navigation contribution and operation ownership. Extract pure Mail domain code and provider transports to workspace packages, retaining compatibility exports.
- [x] Enforce Mail status at HTTP and delegated dispatch boundaries and worker selection. Add an authenticated configuration view to the existing session. Test direct canonical/legacy routes and disabled worker ownership.
- [x] Reject disabling Mail with retained connections, native services, legacy accounts or pending operations. Keep draining jobs and existing management available; prevent new Mail provisioning. Test absent schemas, retained rows and database errors.
- [x] Connect Console navigation and direct Mail pages to the server-provided configuration. Move Mail navigation metadata into the module, retaining the current shell renderer and URLs. Verify client exports do not reach secrets or app internals.
- [x] Run registry/lifecycle tests, provider regression tests, API unit checks and Console/API typechecks. Review the diff; record actual checks and remaining architecture phases.

## Review focus

- Disabled module cannot be reached via compatibility URLs, Studio dispatch or a worker.
- Missing/invalid config never enables a module; an absent config preserves existing installations.
- Draining keeps delivery/reconciliation active but prevents creating new accounts.
- Retained suspended native instances count as resources; a DB error never means zero resources.
- Console state comes from the API revision, with no unscoped client cache or provider credential export.

## Execution record

- Preserved the existing Bun API and PostgreSQL registry introduced after the supplied architecture draft. No app rename or second provisioning stack was introduced.
- Extracted provider-independent Mail core plus product metadata/schema utilities, navigation contribution/hook, and four turboSMTP transports. Compatibility exports retain all prior import paths. Remaining authenticated service orchestration stays in the API; full extraction is a later core/principal task.
- Independent review found that draining incorrectly blocked resuming retained incoming instances. Added a failing regression, fixed the service guard to inspect persisted state, and verified both blocked first activation and allowed resume. Follow-up review found no additional concrete issue.
- Verification: API/Console builds and typechecks; module/Console/API unit suites; Mail/Studio provider regressions on disposable PostgreSQL; restricted-worker RLS preflight. External provider network access is blocked by the test harness.
- No production migrations, deployments, external messages, remote provider changes, commits or publication.
