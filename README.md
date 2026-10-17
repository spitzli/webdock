# Webdock

Webdock is a plugin-based admin platform with a small identity, project registry and capability core. Hosting, databases, Mail, CMS and storage are optional product modules; new installations enable no products by default. Billing is not included. It is maintained by Spitzli Development. Customer websites keep their own repositories and content stores.

## Repository structure

```text
apps/          Executable HTTP applications: Console, Control Plane, Auth, website
modules/       Product behavior: hosting, databases, mail, storage, cms
adapters/      Product area / provider: hosting/vercel, auth/clerk, mail/turbosmtp, …
packages/      Shared contracts, identity, registry, database schema and UI primitives
integrations/  Cross-runtime integrations, including the native Tabularis gateway contract
agents/        Separately privileged executors, currently Kubernetes
deploy/       Container, Compose and Helm distribution
tools/        Installation, migration, release and test tooling
docs/         Public guides and internal architecture/verification records
```

The module owns what an operation means; the adapter implements its provider-specific I/O. The Control Plane composes them and supplies server-side credentials. The Console calls the API and never receives provider credentials. Modules are selected per installation and retain tenant/project authorization within that installation. See [adapter layout](adapters/README.md), [module configuration](docs/developers/modules.mdx), [self-hosting](docs/developers/self-hosting.mdx) and [implementation status](docs/architecture/modular-platform-status.md).

## Runtime responsibilities

| Runtime | Responsibility |
| --- | --- |
| `apps/console` (`@webdock/admin`) | Operator and customer browser interface |
| `apps/control-plane` (`@webdock/api`) | Authentication composition, authorization, core registry, product services, protocols and optional workers |
| `apps/auth` (`@webdock/auth`) | Native account setup and retained authentication frontend |
| `apps/website` (`@webdock/web`) | Public website and its own CMS |
| `apps/database-gateway` | Scoped access to isolated native Tabularis runtimes |
| `agents/kubernetes` | Enrolled execution and reconciliation on authorized clusters |
| `apps/cms` (`@webdock/cms`) | Historical shared-CMS notice and offline migration tools |

Browser authentication can use Clerk or Better Auth. Local immutable user IDs, current memberships and resource permissions remain authoritative; external identities are explicitly mapped, never automatically linked by email. Legacy OAuth, MCP and service credentials keep their own contracts. See [authentication adapters](docs/developers/auth-adapters.mdx).

Product selection is installation-wide. `enabled` allows authorized operations, `draining` blocks new provisioning while retaining supported management/reconciliation, and `disabled` removes product access after retained-resource checks. Core registry and platform persistence do not depend on customer CMS or Databases being enabled. Enabling a module does not create provider accounts, subscriptions or customer infrastructure.

## Development

Use Node 24, the workspace-pinned Bun runtime and the root npm lockfile:

```sh
npm ci
npm run dev                 # public website
npm run dev:admin           # Console, port 3120
npm run dev:auth            # native Auth frontend
npm run dev -w @webdock/api # Control Plane
npm run test:modules
npm run test:unit -w @webdock/api
npm run test -w @webdock/admin
```

Prepare each app's local configuration before starting it. Consult its environment examples and [local development](docs/developers/local-development.mdx). Never commit production credentials or use customer databases for tests. Runtime configuration supplies origins and module selection; provider secrets remain server-side.

## Tests and installation

API integration and restricted-role tests use owned disposable local PostgreSQL fixtures:

```sh
npm run test:setup -w @webdock/api
npm run test:integration -w @webdock/api
npm run test:ported -w @webdock/api
npm run test:setup:rls -w @webdock/api
npm run test:rls -w @webdock/api
npm run test:teardown -w @webdock/api
```

Follow [self-hosting](docs/developers/self-hosting.mdx) and [initial operator setup](docs/developers/initial-setup.mdx) for the explicit offline migration and bootstrap flow. Container, Compose and Helm artifacts are under `deploy/`; release validation is under `tools/release/`. Runtime roles are restricted, migration credentials are separate, and schema changes never run implicitly from browser requests. A local successful build is not a production deployment or published release.

## Identifiers

Platform-owned IDs use **Snowflake**, selected on 2026-10-03: a 2026-01-01 epoch, 41 timestamp bits, node 0 in 10 bits and a 12-bit sequence. PostgreSQL coordinates allocation across serverless instances; IDs remain decimal strings in JavaScript, JSON and Payload fields. Failed business transactions do not reuse allocated IDs. Do not allocate node 0 from another independent database for the same ID namespace. Framework/provider-issued IDs remain provider references.

## Architecture and operations

- [Current modular-platform status](docs/architecture/modular-platform-status.md)
- [Module lifecycle and boundaries](docs/architecture/module-installation.md)
- [Provider adapter layout](adapters/README.md)
- [Verification and operational limits](docs/verification/2026-10-15-platform-completion.md)
- [Native Mail deployment decision](docs/architecture/mail-deployment-decision.md)
- [Auth rollout status](docs/architecture/auth-rollout-status.md)
- [Studio MCP, GitHub and passkeys](docs/architecture/studio-integrations.md)

Incoming Mail remains explicitly activated per customer and uses an isolated Stalwart Community Edition instance. Outgoing-only Mail does not allocate Stalwart. Suspension retains data; deletion is a separate authorized operation. Existing Studio/OAuth/MCP protocol URLs and local decimal IDs are compatibility contracts, independent of filesystem names.
