# Reviewable implementation slices

These are the execution units within the dependency groups in README.md. Source paths below are relative to the existing Auth `src/lib` unless prefixed Admin; target modules are under `apps/api/src/modules`. Each slice adds its specific test under `apps/api/tests`, ports its existing focused tests, runs them failing before implementation and passing afterwards, then commits independently. Domain-wide tests in README.md remain the final group gate. A partial slice is not authorization to move public traffic while its dependencies are incomplete.

| Slice | Source → target | New test file | Observable acceptance |
|---|---|---|---|
| A03.1 native session | `auth.ts`, `cookie-policy.ts`, `lazy-auth.ts` → `auth/` | `auth-session.test.ts` | Existing signed cookies accepted, expired/revoked rejected; exact session age and no cookie cache |
| A03.2 identity security | `passkeys.ts`, auth hooks, `tenant-policy.ts` → `auth/` | `auth-mfa.test.ts` | Password/MFA setup restrictions, reset revocation, passkey RP-ID and counter behavior |
| A03.3 federation | `authorization.ts`, `mcp.ts`, OAuth plugin → `auth/` | `auth-oidc.test.ts` | Discovery/issuer, code+PKCE, confidential/public clients, refresh and current claims |
| A03.4 adapter | Existing full Auth schema → `db/schema/auth.ts` | `auth-adapter.test.ts` | Same fixture identities/session/JWKS before and after pg→Drizzle; no implicit IDs or new tables |
| A04.1 portal | Admin `sso.ts`, `sso-routes.ts`, payload-sso behavior → `portal/` | `portal-cookie.test.ts` | Opaque old cookie, refresh/logout, state and return URL restrictions preserved |
| A04.2 transport | Auth `studio-api.ts`, Admin `studio-client.ts` → `portal/studio.ts` + client | `portal-delegation.test.ts` | Exact operation body limits/errors; live identity before every operation; UI has no sealing secret |
| A05.1 membership | `tenants.ts`, `access-management.ts`, tenant policy/schema → `access/`, `tenants/` | `access-membership.test.ts` | Last owner, invite, grant revocation and archived customer boundaries |
| A05.2 preview | `tenant-preview.ts`, schema and Admin guard clients → `access/` | `access-preview.test.ts` | Active/expired preview read restrictions; explicit exit restores real actor only |
| A06.1 customer | Admin collections Customers + registry customer functions → `registry/customers.ts` | `registry-customers.test.ts` | Profile validation, no archive with active project, tenant trigger and audit once |
| A06.2 project/instance | Admin Projects/Instances + registry → `registry/{projects,instances}.ts` | `registry-projects.test.ts` | Ownership immutable, active parent, instance uniqueness, retire before archive |
| A06.3 users/audit | Admin Users/Audit, instance-kit operator policies → `registry/{users,audit}.ts` | `registry-users.test.ts` | Current operator mapping/MFA, self/last-operator protections, read-only audit |
| A07.1 manual plans | `plans.ts` template/assign/assign-custom/extras → `plans/plans.ts` | `plans-assignment.test.ts` | Revision conflicts, immutable history, custom assignment no template, extras retained |
| A07.2 private offers | `plans.ts` getOffer/acceptOffer → same service | `plans-offers.test.ts` | Expiry/tenant/revision/acceptance races; unchanged no-payment message |
| A08.1 secrets/settings | `platform.ts` → `platform/platform.ts`, `secrets/codec.ts` | `platform-secrets.test.ts` | Existing cipher vectors and wrong-purpose failure; masked API |
| A08.2 jobs/storage | `storage-usage.ts`, cron → `platform/storage-usage.ts`, worker | `storage-jobs.test.ts` | Partial result not zero; single schedule slot and stale lease completion rejected |
| A08.3 cache | New private cache adapter | `cache.test.ts` | Authorized tenant/version keys, DB fallback, no sensitive object caching |
| A09.1 connections | `tenant-mail.ts`, `mail-{service,configuration,budget,domains,tracking,keys}.ts`, `turbo*.ts`, product connections/account/credentials → `mail/` | `mail-connections.test.ts` | Managed/BYOK budgets, encrypted old keys, unknown provider create does not duplicate |
| A09.2 incoming/native | `mailboxes.ts`, `mail-sessions.ts`, `mail-agent.ts`, `mail-gateway.ts`, native key/send/submission modules → `mail/` | `mail-native.test.ts` | Explicit incoming activation, no Stalwart for outgoing-only, webmail token isolation and retained storage |
| A09.3 sending | Product messages/content/quota/idempotency/batches/schedules/sending/transport → `mail/mail-product/` | `mail-delivery.test.ts` | Accept→timeout yields outcome_unknown, no resend; batch/revision/quota races safe |
| A09.4 callbacks/jobs | Product callback inbox/events/webhooks/retention/jobs/reconcile → `mail/mail-product/` | `mail-jobs.test.ts` | Durable callback, signature/SSRF checks, lease CAS, revoke/pause respected, retention separated |
| A09.5 public API | Product api/http/access/api-contract/openapi/studio → `mail/mail-product/`, protocol | `mail-http.test.ts` | Every contract operation and negative permission case; public docs expose no secrets |
| A10.1 inventory/admission | hosting clusters/authorization/allowances/registry-access/reservations → `hosting/` | `hosting-admission.test.ts` | Cluster/tenant ownership, fresh capacity, concurrent reservation, EU guard |
| A10.2 applications | hosting apps/operations/environment/agent-api → `hosting/` | `hosting-applications.test.ts` | Existing commands, revoked agent, stale claim, log abort, retained volume and explicit purge |
| A10.3 git worker | hosting git deployment/source/publication/reconciliation/worker modules → `hosting/` | `hosting-git.test.ts` | Duplicate callback, stale build generation, artifact verification, publication failure recovery |
| A11.1 orders/lifecycle | hosting database-orders/billing/schema/databases/protection → `databases/` | `databases-lifecycle.test.ts` | Capacity/order idempotency, platform self-protection, delete vs purge |
| A11.2 gateway/maintenance | databases http/service/schema + hosting database credentials/agent/maintenance/migration/observations → `databases/` | `databases-gateway.test.ts` | Non-owner SQL isolation, credential/ticket expiry, no platform/archive access, retained migration source |
| A12.1 GitHub | Admin github + hosting git-github/git-oauth → `integrations/github/` | `integrations-github.test.ts` | Callback binding/state, correct repository grants, unchanged redirect |
| A12.2 Vercel | Admin vercel + hosting byok-vercel/git-vercel modules → `integrations/vercel/` | `integrations-vercel.test.ts` | API-owned credentials, old OAuth flow finishes, signed region event, team isolation |
| A13.1 CMS/Canvas | Admin canvas/demo bridges + content/request actions → `cms-bridge/` | `cms-content.test.ts` | Binding/role checked for read/save/upload; revoked existing session blocked |
| A13.2 Shop/Calendar | Admin studio-shop and shop/calendar actions + server package exports → `cms-bridge/` | `cms-commerce.test.ts` | Existing edit permissions, foreign origin rejected, validation/conflict parity |
| A14.1 MCP/registry HTTP | Admin mcp/hosting-mcp/registry-api + Auth introspection → `mcp/` | `mcp-tools.test.ts` | Exact tools derived from schemas, bearer-only registry, separate scopes, discovery unchanged |
| A14.2 deletion | Admin project-deletion modules + Auth lifecycle → `lifecycle/` | `lifecycle-deletion.test.ts` | Preview hash and exact name, resumable ledger, no deletion of unrelated or financial records |

B01–B09 are already separate billing slices; use the source plan's numbered checklist and README corrections. A01/A02 are prerequisite proofs; A15/A16 are closure and operating gates. No slice is considered complete from a unit test alone when it explicitly requires real DB/ingress/provider evidence.
