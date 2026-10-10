# Tenant database browser

Studio embeds the Tabularis explorer, SQL editor and data grid. Webdock Auth owns project bindings and explicit per-user grants; this gateway connects each grant to a dedicated Tabularis runtime. The initial integration supports PostgreSQL. Operators administer bindings and grants with MFA, but also need an explicit grant to browse a database. Customer preview cannot open database sessions.

## Activation

1. Apply the existing Auth, hosting and Studio migrations first, then run `node --import tsx apps/auth/scripts/migrate-databases.ts` with the Auth migration database credentials. The new tables live in `webdock_auth`; use the existing schema owner/runtime privilege conventions.
2. Configure Auth with `WEBDOCK_DATABASE_GATEWAY_ORIGIN` and a random `WEBDOCK_DATABASE_GATEWAY_SECRET` of at least 32 characters. The gateway uses the same secret. Auth also needs its existing `BETTER_AUTH_SECRET`, Studio OAuth consumer configuration and hosting region configuration. Production authorization retains the existing verified-region gate (`WEBDOCK_HOSTING_EU_VERIFIED=true` for the verified non-Vercel runtime, or the existing `vercel-fra1` policy).
3. Configure and start the gateway with Node 24 using `.env.example` and `npm start -w @webdock/database-gateway`. Put TLS in front of it, including WebSocket upgrades. Use a gateway hostname on the same site as Studio, for example `database.webdock.dev` and `studio.webdock.dev`. The session cookie is HttpOnly, SameSite=Strict, Secure over HTTPS, and scoped to its workspace path. Cross-site embedding is not supported.
4. Provision a separate Tabularis process/container **and storage directory for every database binding, user and permission profile**. Restrict network access to the gateway and the assigned database. Configure only the assigned saved connection; do not mount unrelated credentials, plugins or host files. Runtime origins must be explicitly included in the gateway allowlist.
5. Use a dedicated PostgreSQL login whose actual privileges match the grant. A read role has only CONNECT, schema USAGE and SELECT on approved objects. A write role adds only intended INSERT/UPDATE/DELETE (and required sequence permissions). Schema roles may manage only their own project schema. Remove inherited/public privileges that would expose other tenants. The gateway does not infer SQL permissions from text; PostgreSQL enforces them, including arbitrary SQL typed into the console.
6. Build Tabularis from the source recorded in `vendor/tabularis-web-ui.json`; apply `vendor/tabularis-web-ui.patch` to the recorded base commit when reconstructing it. Build the web assets with `pnpm build` and the Rust server with `TABULARIS_BUILD_COMMIT=<sourceCommit> cargo build --release --manifest-path src-tauri/Cargo.toml --bin tabularis --locked`. Configure `TABULARIS_EXPECTED_COMMIT` to that same source commit. Debug builds without a stamped commit intentionally fail the production gateway check.
7. Start Tabularis in proxy authentication mode (`tabularis web --help` documents the exact options). Configure its public origin, allowed gateway origin, data directory and a unique proxy secret. Terminate HTTPS on its private origin. Never expose the proxy-authenticated backend directly to customers. Store its saved connection and database credentials only in that runtime's protected storage.
8. In Studio → tenant → Databases, register the project database and assign access to the intended customer or operator using its isolated runtime origin, connection ID and proxy secret. The operator verifies isolation and database-role privileges before activation. Secrets are encrypted by Auth and are never returned in directory/launch DTOs.

This delivery registers existing runtimes. It does not schedule containers, provision database roles, deploy infrastructure or execute production migrations. Hand the runtime deployment requirements to the GitOps deployment workstream. For the repository's existing Vercel applications, install the Vercel CLI (`npm i -g vercel`) when managing their environments or deployments; it is not required to run this standalone gateway.

## Lifecycle and limits

Launch codes expire after 60 seconds and are consumed atomically once. Browser sessions expire after 15 minutes and remain bound to the native Auth session and grant revision. Every RPC and WebSocket event checks current authorization. The gateway rechecks before returning query data and every three seconds during long requests/events; cancellation is best effort and is never a guarantee that a submitted database write was rolled back.

Revoking access, disabling a binding, removing membership or ending the native session denies existing access. Replacing a grant invalidates its sessions. A runtime origin is permanently reserved to its original binding/user/profile: use a fresh isolated runtime when changing privileges or ownership. Decommission old processes/storage separately after revocation. Do not reuse their origin or data directory.

The gateway limits active RPCs (64 globally, 16 per browser session, 4 query operations per session), request/response sizes (1 MiB/8 MiB), upstream timeouts and event connections. It logs command names, actor/scope, status and duration, not SQL, result rows or credentials. Expired database launch/session records should be periodically deleted according to the installation's retention policy; audit retention and automated cleanup scheduling remain deployment responsibilities. Runtime memory/CPU capacity has not been load-tested.

Host configuration, arbitrary connection creation, extensions, tunnels, uploads/imports and detached windows are unavailable. The embedded UI may retain some upstream controls that return a permission error. Clipboard row editing is separate from bulk file imports. SQL tabs belong to the upstream browser session; opening a fresh Webdock session starts a new tab workspace. Save important SQL as a named query in the isolated runtime before leaving. Theme, locale, focus and fullscreen changes retain the currently mounted editor and its drafts. Partial grid writes acknowledge successful operations and require review/refresh after an uncertain failure; they are not automatically retried.

## Validation

From the repository root with Node 24:

```sh
npm test -w @webdock/database-gateway
npm run check -w @webdock/database-gateway
node --import tsx --test packages/database-contracts/src/index.test.ts
node --env-file=.env.database-test.local --import tsx --test apps/auth/tests/databases/integration.test.ts
```

The Auth integration test intentionally resets schemas only in the dedicated fixture database `postgres://…@127.0.0.1:55441/webdock_admin_test`; it refuses other destinations. Do not point this test at a shared development or production database. Real-runtime tests are opt-in with `WEBDOCK_DATABASE_RUNTIME_TEST=true` and use local reader/writer runtimes on ports 3138/3158, with their protected HTTPS proxies on 3139/3159. See the test sources and the verification record for fixture requirements.

`scripts/database-browser-fixture.ts` supplies deterministic test identities and sealed Studio cookies for the isolated browser check. It does not replace or validate the complete production OIDC login ceremony. Its local secrets are synthetic fixture values; it refuses production mode and any database outside the dedicated test endpoint.
