# Managed Analytics implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task.

**Goal:** Run Umami at moon.webdock.dev and use the same managed analytics provisioning for webdock.dev and future customers.

**Architecture:** One pinned Umami deployment in the existing Webdock platform project; separate least-privileged database on the existing PostgreSQL installation. A small managed analytics integration provisions sites through Umami's API. Webdock's public homepage is the first real site. Optional tracking domains expose only collection endpoints and require verified ownership/DNS. Keep provider secrets out of browser/plugin frames.

**Tech Stack:** Umami 3.4.0, PostgreSQL, existing Kubernetes/Traefik/cert-manager, TypeScript.

**Spec:** Owner-approved chat proposal, 2026-10-17, including explicit requirement to use it on the main page.

## Global constraints
- Existing database server; no MariaDB or ClickHouse.
- Retain existing Core, Registry and unrelated customer resources.
- Preserve strict database TLS; independent database credentials.
- English plugin content and documentation.
- Production plugin installer is unfinished: do not pretend an operator integration is an installed customer plugin.
- Production website tracking must use the same API provisioning implementation as the addon.

## Review focus
- Repeated provisioning must not create duplicate sites.
- Tenant/project identities and provider credentials must not be browser-controlled.
- Custom domains must not expose the admin interface or allow arbitrary destination proxying.
- Preview/local traffic must not contaminate production analytics.
- Deployment must not expose Umami's default credentials during bootstrap.

### Task 1: Deploy Umami
- [x] Inspect current platform app workflow and upstream runtime contracts.
- [x] Provision isolated logical database, retain auxiliary lifecycle guards and scoped network access.
- [x] Deploy pinned image without public ingress; initialize admin securely.
- [x] Add moon DNS/TLS and verify login, database identity and health.
- [x] Record reproducible manifests and private credential locations.

### Task 2: Managed Analytics integration
- [x] Test API provisioning retry/idempotency and untrusted input rejection.
- [x] Implement provider client and operator entrypoint used by the plugin; secrets remain server-side.
- [x] Implement plugin manifest/actions, configuration and UI, including domain request validation and explicit provisioning status.
- [x] Test actual Umami provisioning and permissions; provision Webdock's real site.

### Task 3: Homepage and documentation
- [x] Integrate production-only tracker with public website ID and domain restriction.
- [x] Deploy minimal homepage change from its production-compatible source.
- [x] Verify browser collection and persisted analytics for webdock.dev.
- [x] Document setup, custom-domain flow, runtime limitations and operating evidence.
- [x] Run focused tests and a fresh final review; resolve material findings.

## Owner-requested follow-up
After Managed Analytics, implement a Tabularium plugin for managed registry hosting (owner request 2026-10-17). Use the existing Webdock registry as the first real consumer, with domain, branding, kinds/manifest schema and GitHub integration. Do not interrupt analytics work for this follow-up.

## Runtime prerequisite (builder review, owner clarified 2026-10-17)
The homepage must consume an actual external plugin. Add generic verified invocation dispatch, scoped HTTP capability, explicit installation/grant bootstrap and authenticated Console invocation before claiming the integration works. A real operator-installed pilot may defer the registry install UI; it must not invent signature/provenance or use the local test host in production. Provider-specific code stays in the external repository. Use per-project provider credentials; no global admin credential in the plugin. Review result: `analytics_builder_check`.

## Required API and MCP surface (owner reminder)
Plugins declare their own namespaced API endpoints and MCP tools in the manifest. Host activation registers/discovers them; disable removes tools and refuses new endpoint work. Console, HTTP and MCP dispatch to the same action authority, project scope and capability enforcement. Managed Analytics must demonstrate all three transports. Test tool name/route collisions, unknown action references, revocation, read-only MCP scopes and disabling. These are required delivery, not deferred follow-up.

## Runtime framework
Owner requires ElysiaJS (2026-10-17). Managed Analytics uses its own ElysiaJS server; host API/MCP/Console route to the same declared plugin actions. Preserve Bun/Elysia conventions of the current Control Plane, and keep plugin-specific routes/code outside Core.

## Review fixes
- Fresh runtime review found an OAuth read-only ceiling race during manifest reload. Reproduced with real TLS/RLS test; now pass the credential ceiling into runtime admission and check the action actually selected (RED → GREEN).
- Valid zero-capability actions were incorrectly post-checked against project.read. Reproduced; invocation liveness now uses the same signed RLS identity/grant/runtime checks without inventing a capability. Capability service calls still require their exact declared capability (RED → GREEN).

## Final delivery review fixes
- JSONB configuration key order and capability order no longer block unchanged updates (RED → GREEN).
- A new runtime generation preserves the stored configuration revision rather than resetting it to zero (unit coverage returns revision 7).
- Operator prerequisites are documented: verify actual Kubernetes image digest and stopped old workload, refresh domain collision inventory, verify custom-domain TLS before activating an override.

## Delivery notes
The main-page browser event and provider counters were verified live. API/MCP transport authorization was verified with the real TLS/RLS integration fixture; this does not claim a new MCP client connection was installed. Custom-domain configuration and DNS/routing planner are tested; no customer custom-domain live deployment was requested. One real English Console screenshot is attached to the release and rendered in the registry README. Public docs are updated and validated in this branch; broader branch integration/publication remains separate.
