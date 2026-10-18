# Existing-provider modular platform verification

Date: 2026-10-15. Scope: the supplied modular-monolith/self-host design, with the owner's explicit decision to finish existing providers before AWS/GCP. All checks use local source, network-blocked provider fixtures, or disposable local Docker databases. No customer resource, production database, provider account, release registry or cluster was changed.

## Implemented boundaries

Six independently selectable product modules own their existing services and UI. The Control Plane and Console compose them through public contracts. Managed database services and the actual Tabularis workbench are owned by Databases, not Hosting. Core identity, registry, local persistence and shared agent transport remain independent. Existing operation names, OAuth/MCP/Studio identities, Snowflake strings, encrypted credentials and physical schemas are retained.

The supported adapter implementations are Better Auth/Clerk, turboSMTP, Vercel hosting/storage, GitHub, PostgreSQL and Polar; the existing Kubernetes executor remains separately privileged. The app/agent directories are now `apps/control-plane`, `apps/console`, `apps/website` and `agents/kubernetes`. npm package names remain compatible.

## Executed checks

| Check | Result |
| --- | --- |
| `npm run test:modules` | 101 passing tests, including public contracts, provider transports, module lifecycle, UI ownership/state isolation and disabled setup-option reads. |
| API unit suite | 99 passing tests, including frontend credential boundaries, callback refresh and process-domain admission. |
| Console suite | 69 passing tests. |
| API integration suite | 12 passing tests across eight isolated files, including Clerk mappings/expiry clamp, native Auth, CMS and composed network server behavior. |
| Full ported provider/product regressions | 315 passing, four restricted-role tests intentionally skipped in the owner-role fixture; those four pass in the dedicated RLS run. |
| Full restricted-role run | 26 Bun tests and four Node tests pass. Includes exact Clerk setup/order/Git worker mapping scopes, forbidden mapping writes, preflight read-only access, retained Mail, Billing recovery and customer database isolation. |
| Fresh install and retained-data upgrade | Pass, including repeated and concurrent migration processes, key mismatch, missing journal history, privileged-role refusal and secret-free output. |
| Initial operator and composed core API | Pass: real password change, TOTP, PKCE, core registry with all products off, denied product routes and authenticated managed database plan lookup with only Databases owned/enabled. |
| Migration/configuration unit tests | Eight pass. |
| Database gateway default suite | 15 pass; three real-runtime checks are opt-in. The packaged managed-runtime opt-in test separately passed against the actual pinned Tabularis binary and disposable TLS PostgreSQL. |
| Kubernetes agent Python suite | 78 pass, one existing opt-in test skipped. |
| API and Console TypeScript | Pass; production image builds also check types. |
| Release/chart/Compose validation | Four manifest tests and positive/negative platform, agent and optional database chart assertions pass; Compose restrictions and optional gateway profile pass. |
| Translation catalogs | All 12 catalogs validate; source references regenerated from 750 files including module and shared UI roots. |
| Mail OpenAPI | Generated snapshot matches the source contract. |

## Review corrections

The independent final security review found one confirmed integration issue: managed database commands retain the wire name `hosting.command`, so process ownership incorrectly required Hosting. `studioOperationDomain` now classifies the actual action with the shared SDK. The real operator/API fixture proves the database-only configuration returns a successful plan list. The reviewer confirmed there is no second Hosting domain requirement in the direct bridge path.

Clerk verification, short native projections, exact worker mapping scopes and the encrypted OAuth callback handoff received a separate read-only review without another confirmed security finding. This review does not substitute for live Clerk handshake testing.

Combined checks also caught and corrected missing Clerk migration application in the disposable fixture and an incorrectly ordered Client Component directive. Setup options now skip disabled/unowned Mail SQL and database services entirely. Database shutdown preflight includes pending setup configurations before a database resource exists.

## Container and documentation checkpoint

Final local AMD64 builds passed for Console, Auth, API, worker, migrator and the BYOK agent. Console/Auth returned HTTP 200 for standalone assets with networking disabled, read-only filesystems and capabilities dropped. The rebuilt API passed six SDK tests and accepted two distinct runtime domain/module configurations in the same image. Worker pool isolation (one test), migrator configuration (three tests) and the agent entrypoint passed under the same restrictions. The optional gateway image uses the pinned existing Tabularis source/runtime; its actual managed-runtime test covers verified TLS, SQL/schema actions, scope denial, revocation, invalid CA and private temporary-state cleanup. Default read-only/capability restrictions remain enabled.

Public pages cover all six modules, initial setup, authentication adapters and self-host operation. Navigation includes these pages; the Self-host and module pages and navigation were inspected in the shared T3 browser at 1280×800. Mint build validation and broken-link checks passed after the final public-page edits. Internal architecture/verification records stay excluded by `.mintignore`. Owned API/RLS and installer/operator database fixtures were torn down; unrelated local containers were preserved.

## Limits

No live Clerk application or provider credentials were provisioned. Production Mail routing/relay/Webmail readiness remains governed by existing operational records. Platform metadata Tabularis launch remains explicitly unsupported and cannot expose an owner connection. No Helm release was installed in a live cluster, no official candidate was published, and ARM64 support is not claimed. A native architecture run and clean committed checkout are required for an official release. The optional gateway adds no automatic database server or registered binding provisioning.
