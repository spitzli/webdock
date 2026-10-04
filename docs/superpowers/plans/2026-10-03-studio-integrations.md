# Studio and integrations implementation plan

**Goal:** Move operations to Studio, use central identity everywhere, improve daily registry work, and expose the same operations through authorized MCP clients.

**Architecture:** Keep isolated Payload instances and their protected identity projections. Studio and MCP share registry validation and Payload access/audit hooks. Better Auth remains the identity provider; GitHub is a separately authorized repository integration.

**Constraints:** English UI; system light/dark default; string Snowflake IDs; signed commits; no customer panel, automatic CMS provisioning or cross-schema runtime credentials.

- [x] Direct SSO: preserve validated admin return paths, hide native users/login, enforce native-auth shutdown after checking mappings and retiring the unused Stall editor. Test malicious return paths and native JWT rejection.
- [x] Studio domain: add and verify studio.webdock.dev, migrate callback/origin/account continuation together, redirect admin.webdock.dev after verification.
- [x] Favicon: derive small SVG/ICO marks from Webdock branding and check their rendering.
- [x] Studio UX: query-backed search/filter/pagination, useful detail screens, explicit inventory status, accessible forms, reversible archive confirmation.
- [x] Registry service and MCP: shared validated reads/writes, operator access, existing atomic audit trail, bounded reads, no destructive or infrastructure commands.
- [x] MCP OAuth: resource discovery, PKCE/consent, scoped read/write access, audience validation, current-account authorization and revocation; register clients with exact redirect URLs.
- [x] Passkeys: native Better Auth integration, enrollment/removal/sign-in, require device verification for direct sign-in, retain password MFA and account recovery (updated at the owner’s request).
- [x] GitHub: installation/account connection and repository selection, server-side credentials and selection verification. Only selected repositories; no code mutations requested.
- [x] Verify local disposable-account flows, production read-only behavior, build/type checks, security review, signed commits and deployments.

## Review focus

Token audience confusion; an old local password/JWT surviving SSO cutover; return URL loops/open redirects; passkey sign-in without verified device confirmation; forged GitHub installation/repository selection. Each boundary needs a failing-input test before rollout.

Live personal GitHub authorization remains an operator browser step; application installation and production configuration are complete.
