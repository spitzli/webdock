# Complete modular-platform implementation

User instruction: continue the complete architecture autonomously, use subagents as useful, and maintain docs. Existing uncommitted slices are part of this work. Owner clarification: finish existing providers first; defer new AWS/GCP services. No live provider/customer actions, production deployment or release publication.

## Integration ledger

- [x] Six product manifests and shared selection contracts, API/Studio/MCP/worker gates.
- [x] Native and product Mail service logic/provider controls extracted into typed factories; API composition wrappers retained.
- [x] Mail presentation components extracted with injected shell renderers/server actions.
- [x] BetterAuth adapter/core local identity contract and Clerk verifier/browser bridge/Console UI/explicit maps/expiry clamps.
- [x] Scoped read-only Clerk mapping access for admitted Mail and Hosting workers; real provider user recheck remains required.
- [x] PostgreSQL connection/service boundary and verified Tabularis gateway policy/launch contract.
- [x] CMS backend factories/UI metadata and exact custom HTTPS origin allowlist.
- [x] Real Vercel provider extraction; Kubernetes stays the separately privileged agent distribution.
- [x] Offline schema baseline, role bootstrap, shared journal/policy migration, retained-data upgrade and key mismatch tests.
- [x] Initial native operator+Console OAuth bootstrap without fake MFA/session, tested through real password/TOTP/PKCE flow.
- [x] Docker/Compose/Helm/release candidate artifacts; worker opt-in and loopback readiness.
- [x] Shared SDK-derived Helm schema, immutable OCI manifest/evidence gates; integrated validation.
- [x] Complete central Mail/Clerk/RLS/browser build regressions after concurrent extraction.
- [x] Mechanical app/agent move after integration, preserving npm package and protocol identities.
- [x] Full public docs/current status/runbooks and final independent review.
- [x] Scope resolved by owner: complete existing providers; AWS/GCP integrations deferred.
- [x] Full Hosting/GitHub/Vercel, Storage/Vercel Blob and Billing/Polar server/UI extraction.
- [x] Logical database server/UI ownership split from Hosting with public contracts.
- [x] Optional packaged native Tabularis gateway distribution and verified runtime artifact.

## Completion evidence

The final combined checks and operational limits are recorded in `docs/verification/2026-10-15-platform-completion.md`. The independent review finding about managed database process ownership is fixed and verified through the real composed API. Platform and gateway images build locally; restricted runtime smoke checks pass. Public docs validate, contain no broken links and render correctly in the shared browser. Owned fixtures are removed.

No release was published or cluster modified. Existing-provider completion refers to modular source ownership, preserved functionality and local self-host packaging; it does not certify live provider account configuration or erase the pre-existing production Mail rollout limits. The separate platform-metadata Tabularis launch remains explicitly unsupported.

## Important constraints

Fresh install uses tools/migrations/install.ts exact host:port/database; bootstrap is explicit empty-database admin operation with distinct private runtime/offline passwords. Upgrade uses restricted dedicated offline role; baseline journal required, no silent adoption of legacy production.

Current roots are apps/console, apps/control-plane, apps/website and agents/kubernetes; npm package identities remain unchanged. Legacy API/OAuth/MCP/SSO URLs and decimal IDs never renamed. Internal registry remains core, independent of optional customer CMS. Shared cluster agent transport is core, not gated by customer Hosting. Native incoming Mail remains opt-in per customer and retains storage on suspension.
