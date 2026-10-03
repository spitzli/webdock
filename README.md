# Webdock

Public source monorepo for Webdock, maintained by Spitzli Development. Applications deploy independently; customer websites keep their own repositories and Payload instances.

| Workspace | Purpose | Status |
| --- | --- | --- |
| `apps/web` (`@webdock/web`) | English landing page and its own Payload CMS | https://webdock.dev |
| `apps/admin` (`@webdock/admin`) | Operator workspace for customers, projects and CMS inventory | https://admin.webdock.dev |
| `apps/auth` (`@webdock/auth`) | Better Auth identity, MFA and OIDC provider | https://auth.webdock.dev |
| `apps/cms` (`@webdock/cms`) | Retired shared-CMS notice and offline migration/verification tools | https://cms.webdock.dev |
| `packages/instance-kit` | Shared protected operator policy | Used by the Webdock applications |

There is one npm lockfile. No build orchestration service is required. Vercel projects use `apps/web`, `apps/admin` and `apps/cms` as their respective root directories. Auth/admin Git deployments are main-only; their production credentials are not configured for previews.

## Development

Use Node 24 and install from the repository root:

```sh
npm ci
npm run dev             # website
npm run dev:admin       # operator workspace, port 3120
npm run build:web
npm run build:admin
npm run lint
```

Each app owns its environment files. See its `.env.example`; never place production credentials in committed files. `.env*`, backups, dependencies and local tooling are excluded from Git and deployment uploads. The management runtime uses a separate restricted `webdock_admin` PostgreSQL schema/login; it cannot read the website schemas.

The management app uses central Better Auth on Neon. Operators enroll MFA before access. Existing website CMS logins have an explicit gradual SSO rollout; legacy-compatible mode must be disabled per site after its users are enrolled. See [identity operations](apps/auth/README.md) and [the SSO adapter](packages/payload-sso/README.md).

The management registry supports customers, projects, existing CMS connection records and immutable audit events. New projects do not provision a CMS. Editing a connection record changes inventory only. Automated provisioning, the customer panel, a collection designer and a shared page builder are not implemented.

## Identifiers

Platform-owned IDs use **Snowflake**, selected on 2026-10-03: a 2026-01-01 epoch, 41 timestamp bits, node 0 in 10 bits and a 12-bit sequence. PostgreSQL coordinates allocation across serverless instances; IDs remain decimal strings in JavaScript, JSON and Payload fields. Failed business transactions do not reuse allocated IDs. Do not allocate node 0 from another independent database for the same ID namespace. Framework/provider-issued IDs remain provider references.

## Tests and migrations

The admin tests require a disposable local PostgreSQL database named `webdock_admin_test`; they refuse remote hosts. Supply `apps/admin/.env.test.local`, provision its schema and apply the checked-in migration before `npm test`. Registry tests reset only that disposable management schema. They cover authorization, relationships, optional CMS, transaction rollback, immutable audit records and Snowflake concurrency/clock behavior.

Run each app's migration command explicitly with its own credentials. Automatic schema push is disabled. `apps/cms/scripts` contains historical offline migration tools; these must never target the management schema. Private source snapshots and original databases are retained outside Git.

## Architecture

- [Control-plane design](docs/architecture/webdock-control-plane.md)
- [Management implementation plan](docs/superpowers/plans/2026-10-03-webdock-admin.md)
- [Independent instance cutover](docs/superpowers/plans/2026-10-03-isolated-instances.md)

Spitzli and Stall stay in their own repositories. Their CMS instances can be listed here without merging their content, accounts or website design into this application. Per-site Plausible tracking remains planned.

See [current rollout status](docs/architecture/auth-rollout-status.md) and [requested next changes](TODO.md).
