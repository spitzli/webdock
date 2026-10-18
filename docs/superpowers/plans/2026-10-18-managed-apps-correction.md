# Managed Apps correction

User decision: operate dedicated customer applications, not their internal business settings. Tabularium is an app in Managed Apps. Shared Umami tracking remains a separate product. Do not change existing registry data or analytics.

## Delivery
1. Withdraw the misleading managed-registry alpha from catalog recommendations and mark repository/release superseded, preserving artifacts.
2. Add a narrow optional app-operation host service, injected from the existing Hosting product. Core remains product-free. Only operator-bound apps in the verified invocation project are visible. No cluster/DB/provider credentials reach the plugin.
3. Create external managed-apps plugin using that service: list/get, start/stop/restart with revision checks, open dedicated app and existing hosting detail. No registry branding/kinds/manifest/provider actions. Initial app: Tabularium; provisioning remains existing operator Hosting workflow, no invented auto-provisioning claim.
4. Update docs and screenshots to these boundaries. Review and test host isolation and plugin surfaces, then publish only verified artifacts. Core deployment remains a separate compatibility-sensitive operation; do not deploy the dirty core wholesale.

## Contract
SDK service `apps`, capabilities `plugin.apps.read` / `plugin.apps.manage`. `ctx.apps.list()` => `{apps: ManagedApp[]}`, `ctx.apps.get({app_id})` => ManagedApp, `ctx.apps.command({app_id,operation,revision,subscription_revision})` => host operation result. ManagedApp: app_id,name,kind (tabularium),status,revision,observed_revision,subscription_revision,operation_id (nullable),origin (HTTPS),console_path (relative hosting detail). Host callback `/v1/plugin/apps` POST receives `{operation: 'list'|'get'|'command', input}`; selectors never include project/tenant/cluster/provider configuration. Mutation idempotency derives from verified invocation operation ID. Host binds app IDs and origins per plugin/project in private operator runtime configuration.

## Verification
Failing tests first for cross-project/binding mismatch, capability denial, unsupported commands/registry writes, stale revisions, secret redaction and safe URLs. Reuse existing Hosting authorization and stop/start semantics, keep database/persistent volume intact. Independent review before publication.

Ruling: The first corrected implementation operates existing app instances; building a new provisioning/billing pipeline is outside this correction. The explicit UI and docs state this.
