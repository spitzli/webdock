# turboSMTP BYOK implementation

User requested customer-owned turboSMTP after Kubernetes/Vercel BYOK, and explicitly authorized the management API as an exception to the EU-only policy; sending uses EU infrastructure. Padding in the Customer tenant card is deferred by explicit correction. No email sending is authorized.

Reuse the existing BYOK policy, Auth service, encrypted credentials, TurboDomainsClient, Studio/API/MCP permission enforcement and gettext workflow. Store the customer connection separately from platform-managed subaccounts. Consumer Key/Secret with API permission can inspect/register sender domains; provider key creation/revocation requires a different Authorization credential and remains in the provider dashboard for BYOK. Existing managed mail keys/tracking keep their original account scope. Never claim these are transparently switched to BYOK.

- [x] Add default-disabled turboSMTP entitlement and finite domain-management allowance; explicit additive migration.
- [x] Add safe connection validation, encrypted storage and credential fingerprint isolation; reject platform-master credential reuse; bounded domain inventory and explicit registration. No mail send.
- [x] Tenant mail connection UI with clear connection, refresh, domain registration and disconnect actions. Require explicit whole-account access confirmation; no secrets in responses, audits or MCP arguments.
- [x] REST/MCP status and management operations reuse the authorization service. Credential entry is Studio-only.
- [x] Tests for foreign tenants, preview, disabled policy, key collisions, stale revisions, secret handling, resource cap and rotation; focused review.
- [x] Translate, build locally, deploy prebuilt in fra1 and verify rendered production pages. Real customer-key validation requires an actual customer-provided credential; no fake live success.

Stable account identity is not exposed by the documented endpoints used here: key fingerprints detect reuse of the same credential, not different keys for the same external account. UI explicitly grants this tenant visibility of all domains in the account and asks for a dedicated provider account. Webdock's domain allowance restricts new registrations through Webdock; it is not a provider sending/spend cap. Existing provider resources are never silently adopted into the platform subaccount tables.

Delivered and deployed. Live customer credential validation remains explicitly unverified; no live credentials supplied. Independent review finding on stale recovery revision fixed and re-reviewed. Padding remains deferred and unchanged.
