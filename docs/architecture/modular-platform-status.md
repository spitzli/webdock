# Modular platform migration status

Source checkpoint: 2026-10-15. This records the current implementation, not a production rollout. The owner selected completion of existing providers first; AWS/GCP service integrations are deferred.

## Current implementation

The modular monolith retains the existing protocol URLs, decimal Snowflake IDs, authorization and operation journals. `apps/control-plane` composes server implementations; `apps/console` supplies the browser shell and authenticated actions. `apps/auth` preserves legacy authentication protocols; `apps/website` is optional. `agents/kubernetes` remains a separately privileged runtime.

| Area | Implementation | Verification boundary |
| --- | --- | --- |
| Module selection | Six static manifests: Mail, Hosting, Databases, CMS, Storage and Billing. Shared SDK validates enabled/draining/disabled selection and dependencies. API, Studio, MCP, workers and Console enforce admission. | Disabled modules must have no retained resources or unfinished operations; startup checks use explicit restricted-role SELECT policies. |
| Identity | Core local identity contract, Better Auth adapter and Clerk verifier, explicit immutable external-to-local mappings, bounded native projection, Console refresh handoff and worker revalidation. | No email auto-linking. External Clerk account setup and live handshake require operator configuration; offline verifier and local database tests do not establish a production cutover. |
| Mail | Native and product services, presentation and turboSMTP transports moved behind module/provider ports. | Explicit incoming activation, isolated customer Stalwart CE, retained suspension and outgoing-only behavior remain governed by the Mail deployment decision. |
| Hosting | Application/setup/Git service factories, UI and Vercel/GitHub adapters; Kubernetes agent retains existing execution controls. | Existing revisions, leases, audit and recovery paths are preserved. No new cloud provider or production resource is provisioned. |
| Databases | Registered/managed database services, PostgreSQL pool adapter and native Tabularis launch/gateway contracts. | Customer credentials remain server-side. Platform metadata inspection is a separate unsupported launch target, never an implicit owner connection. |
| CMS and registry | Customer CMS services and origin validation belong to the CMS module; internal customer/project registry remains core. | Disabling customer CMS leaves core registry and local platform persistence available. |
| Storage | Vercel inventory adapter, bounded provider reads, service factory and connection UI. | Disabled modules do not load provider data; draining blocks new connections while preserving management. |
| Billing | Catalog, checkout, subscription and durable reconciliation factories, Polar transports and UI. | New provisioning/upgrades are gated; retained subscriptions, downgrade/recovery and webhook processing keep their existing controls. |
| Shared packages | Core, platform database schemas, module SDK, Console UI primitives and typed provider contracts. | Modules do not import application internals; application compatibility wrappers preserve existing callers. |
| Self-host installation | Docker targets, Compose with external PostgreSQL, Helm charts with SDK-derived selection schema, separate optional agent and worker, offline baseline/migrations and initial operator bootstrap. | Empty installation and retained-data upgrade use isolated local PostgreSQL. Bootstrap never fabricates MFA or a browser session. |
| Release tooling | Version/OCI manifest, native-architecture execution evidence, checksum/signature/SBOM/provenance flow and EU runner workflow. | No release published. ARM support requires a successful native ARM run; dirty worktrees cannot produce official candidates. |

## Acceptance and remaining verification

The integration ledger is `docs/superpowers/plans/2026-10-15-platform-completion.md`. Dated records under `docs/verification/` retain the exact checks executed at each checkpoint; earlier counts are not current combined-suite evidence. The logical Hosting/Database split, worker policies, combined regressions, image builds, optional native Tabularis gateway and final review are verified in `docs/verification/2026-10-15-platform-completion.md`.

Public instructions are in `developers/modules`, `developers/self-hosting`, `developers/initial-setup` and `developers/auth-adapters`. Individual architecture boundary documents describe ownership and retained compatibility behavior.

Dynamic third-party plugins, universal cloud adapters, automatic cloud migrations and full AWS/GCP parity remain outside this first implementation. Existing production Mail delivery/Webmail rollout limits are unchanged; see `mail-deployment-decision.md` and its operational evidence.
