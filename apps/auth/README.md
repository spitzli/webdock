# Webdock identity

Self-hosted Better Auth 1.7.7, Organization, Two Factor and OAuth Provider, backed by the isolated `webdock_auth` PostgreSQL schema. Production identity origin: `https://auth.webdock.dev`.

Public registration and dynamic OAuth client registration are disabled. An offline operator command creates first-party clients with exact redirect URIs and PKCE. Organization roles do not grant global operator rights. Operators must change the initial password and enroll an authenticator before receiving CMS/management access. MFA enrollment revokes earlier non-MFA sessions.

Production cookies begin `__Host-`, are Secure/HttpOnly and have no Domain attribute. Customers' sibling subdomains must never receive or set central cookies. OAuth access tokens are opaque, valid for at most eight hours, and introspected by every protected relying-app request. Current account, membership and project grants are checked on introspection. ID tokens expire after five minutes; they are used only to validate the callback. No refresh-token grant is enabled.

`app_binding` associates a registered OAuth client with an organization; `project_grant` assigns a member reader/editor/admin access to that binding. Platform operators have separate global access after MFA. New users must be explicitly bound to existing local Payload projections; runtime email matching or automatic account linking is forbidden.

The auth database uses Snowflake node **1**, while the management registry uses node **0**. The epoch is 2026-01-01. Entity IDs and first-party client IDs are decimal strings; session/reset/authorization/CSRF/recovery secrets remain cryptographically random.

## Operations

Use Node 24 and install from the monorepo root. Each command requires the intended app-specific environment file.

- `scripts/provision.mjs /path/to/owner.env`: offline role/schema setup; never deploy owner credentials.
- `scripts/migrate.ts`: manually runs the pinned Better Auth schema migration and installs the ID/default/authorization tables. Runtime never pushes schema changes.
- `scripts/bootstrap-production.ts`: explicit operator bootstrap and first-party client registration, private credentials written to ignored files. It refuses to replace an existing identity without its bootstrap file. Complete password change and MFA yourself; no automatic real emails are sent by bootstrap.
- `scripts/local-e2e.ts`: disposable localhost browser fixture only; never production identities.
- `npm test`: real local database auth/MFA/OIDC/revocation/isolation checks. It refuses remote databases and resets its own test auth tables. SMTP is mocked in these tests.

Credentials and recovery material are not committed. Initial operator credentials live in the local ignored `.env.bootstrap` (mode 600). Do not share or commit that file. Existing website passwords are not copied to this service.

Relying apps use `@webdock/payload-sso` or a pinned vendored copy. The new management app is SSO-only whenever configured. Existing websites initially keep an explicit temporary legacy-compatible rollout; set `WEBDOCK_SSO_ENFORCE=true` only after account mapping and human enrollment. This disables local Payload password/recovery/JWT authentication while retaining fields/history. A site with legacy compatibility is not a completed SSO-only cutover.

Auth/admin production credentials are not provisioned to Vercel previews; automatic Git deployment is main-only until isolated preview identity resources are configured. Public website rendering has no dependency on a central login session. No customer-facing panel, automatic CMS provisioner or impersonation UI is shipped here.
