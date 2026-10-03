# Studio and integrations implementation plan

**Goal:** Move operations to Studio, use central identity everywhere, improve daily registry work, and expose the same operations through authorized MCP clients.

**Architecture:** Keep isolated Payload instances and their protected identity projections. Studio and MCP share registry validation and Payload access/audit hooks. Better Auth remains the identity provider; GitHub is a separately authorized repository integration.

**Constraints:** English UI; system light/dark default; string Snowflake IDs; signed commits; no customer panel, automatic CMS provisioning or cross-schema runtime credentials.

- [ ] Direct SSO: preserve validated admin return paths, hide native users/login, enforce native-auth shutdown after checking mappings and retiring the unused Stall editor. Test malicious return paths and native JWT rejection.
- [ ] Studio domain: add and verify studio.webdock.dev, migrate callback/origin/account continuation together, redirect admin.webdock.dev after verification.
- [ ] Favicon: derive small SVG/ICO marks from Webdock branding and check their rendering.
- [ ] Studio UX: query-backed search/filter/pagination, useful detail screens, explicit inventory status, accessible forms, reversible archive confirmation.
- [ ] Registry service and MCP: shared validated reads/writes, operator access, existing atomic audit trail, bounded reads, no destructive or infrastructure commands.
- [ ] MCP OAuth: resource discovery, PKCE/consent, scoped read/write access, audience validation, current-account authorization and revocation; register clients with exact redirect URLs.
- [ ] Passkeys: native Better Auth integration, enrollment/removal/sign-in, preserve MFA challenge and account recovery.
- [ ] GitHub: installation/account connection and repository selection, server-side credentials and selection verification. Only selected repositories; no code mutations requested.
- [ ] Verify local disposable-account flows, production read-only behavior, build/type checks, security review, signed commits and deployments.

## Review focus

Token audience confusion; an old local password/JWT surviving SSO cutover; return URL loops/open redirects; passkey bypass of MFA; forged GitHub installation/repository selection. Each boundary needs a failing-input test before rollout.
