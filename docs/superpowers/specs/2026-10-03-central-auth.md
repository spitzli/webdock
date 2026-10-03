# Central Webdock identity and SSO design

Status: provider and common-login goal selected by the owner. This specifies the integration boundary; the new production login has not been implemented or deployed. Better Auth runs in our application infrastructure, with Neon as PostgreSQL storage. The managed Neon Auth service and WorkOS are not selected.

## Goals and boundaries

One identity can access the Webdock operator workspace, the future customer panel and authorized independent Payload admins. Customers/projects can exist without a CMS. Website content, databases/schemas, deployments and local admin UIs remain independent. The public monorepo is `spitzli/webdock`; external customer website repositories stay separate.

Use `apps/auth` for the eventual identity service at `auth.webdock.dev`; `apps/admin` is its first relying application. Use Better Auth's maintained Organization, Two Factor and OAuth Provider integrations, pinned to mutually compatible versions verified at implementation time. Verify the exact OAuth Provider package maturity/version before deployment; do not hand-write an OAuth authorization server.

## Identity versus permissions

- The auth service owns sign-in, verified email, MFA enrollment/recovery, identities, sessions, organizations and membership.
- Webdock owns projects, CMS instances, platform operator assignment, per-project access and audit history.
- A user's platform role is separate from their organization role. An organization owner cannot promote themselves to platform operator or remove platform-owned recovery/hosting access.
- Organizations represent customers/teams; a user may belong to several. Switching active organization is UI context, never authorization by itself.
- Prefer invitation-only onboarding initially: the operator creates the customer/project; organization admins can invite members within the permissions we explicitly grant. Do not infer trust or organization membership from email domain alone.
- Initial project permissions: viewer, editor and project administrator. Exact actions are enforced on the server and mapped to each Payload instance. Organization membership alone does not grant access to every unrelated instance.

## SSO across customer domains

Use standard authorization-code flow with PKCE, state and OIDC nonce for each relying app. Register a distinct client and exact redirect URI(s) per deployed app/instance. Disable dynamic client registration and wildcard redirects by default. Validate issuer, signature, audience/client binding, nonce and expiration before creating a local session.

Auth cookies are host-only, Secure and HttpOnly; do not set Domain=.webdock.dev. Customer preview sites may run on sibling subdomains and must never receive the central auth session. Neither cross-domain cookies nor browser localStorage are the transport for login tokens.

Each app retains its own session after the central login redirect. Each Payload deployment receives a pinned shared auth adapter, verifies its own client/instance binding and maps the subject to a local user projection for Payload permissions and document history. Password authentication for migrated normal accounts is disabled only after their SSO path is verified.

A valid login to one organization must not become a valid session for an unrelated CMS by changing a URL, query parameter or organization selector. Recovery access for the platform remains explicit, protected and audited. “View as” is a separate later capability with a visible identity distinction, bounded duration and auditing; it is not a shared password or an unlogged bypass.

## MFA, revocation and recovery

Recommend MFA for every platform operator before enabling infrastructure-changing actions. Customers can use their own enrollment policy later. Use Better Auth's maintained TOTP/recovery mechanism; codes, passwords, tokens and recovery secrets never enter audit payloads.

Global user suspension, membership removal, project access removal and instance suspension need explicit local-session revocation semantics. Do not rely on long-lived JWT organization claims alone. Before shipping, define a short access-token lifetime and a bounded permission recheck/refresh path, including provider outage behavior. Existing sessions may fail closed for protected mutations without making public websites unavailable.

Operator recovery must survive a customer's organization deletion, ownership changes and member removal. Hosting, database ownership and recovery secrets remain outside customer-controlled accounts.

## Identifier policy

Business entities and locally controlled identity projection IDs use Snowflake decimal strings. Preserve provider/library identifiers where required and link them explicitly; do not assume an email address is a stable key. OAuth state, authorization codes, session tokens, reset tokens and MFA recovery secrets remain cryptographically random regardless of the entity ID policy.

The current management allocator uses one PostgreSQL coordinator and node 0. The auth implementation must either safely reuse the authoritative allocator or reserve a distinct node namespace; never create a second independent node-0 allocator that can collide. Better Auth's ID-generation interface must be verified before choosing custom database defaults or an adapter integration.

## Migration sequence

1. Finish and verify the monorepo migration; do not change existing website login behavior during that move.
2. Build the isolated auth service and first-party Webdock admin integration in an isolated preview database. Prove organization isolation, MFA, logout/revocation and cross-domain redirects with test accounts.
3. Bootstrap the real platform operator through a secure enrollment flow. Do not copy Payload password hashes into Better Auth's password column: the formats and algorithms are not assumed compatible.
4. Move the operator workspace to central identity and remove its development password-login dependency.
5. Migrate each independent Payload admin one at a time using the same tested adapter. Preserve local content references/history; use explicit subject mappings. Keep a controlled recovery path until cutover is verified.
6. Build customer-facing self-service later against the same identity and permission model.

## Acceptance tests before any auth cutover

- Same user signs into the operator app and authorized CMS domains using central identity, with separate host-only sessions.
- A sibling/customer subdomain receives no central session cookie.
- Wrong client, issuer, audience, nonce, state, expired token, reused code and unregistered redirect are rejected.
- Organization owner cannot access operator actions, other organizations or unassigned projects.
- Removing membership or project access revokes effective access within the documented bound.
- Operator MFA/recovery works without granting customers power over operator identity.
- Existing local CMS history/user projections remain correctly attributed after account mapping.
- No production identities or messages are used in tests; separate preview auth/database branches are mandatory.

Primary references checked on 2026-10-03:
- https://better-auth.com/docs/plugins/oauth-provider
- https://better-auth.com/docs/plugins/organization
- https://better-auth.com/docs/plugins/2fa
- https://neon.com/docs/auth/overview (managed service comparison)
