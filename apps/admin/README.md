# Webdock operator workspace

This app is part of the public `spitzli/webdock` monorepo. It authenticates through the central Better Auth service. When SSO is configured, local Payload login, recovery and old JWTs are rejected; user records remain as identity/permission projections.

Customers, projects, existing CMS connections and append-only audit events are implemented. The registry never provisions infrastructure as a side effect of ordinary CRUD. Link an existing deployed CMS using its admin URL and provider references. This does not enable, suspend or delete the external service.

Run commands from the monorepo root with `npm run <command> -w @webdock/admin`, or inside this directory after the root `npm ci`.

- `npm run dev` starts on port 3120.
- `npm run check`, `npm run lint` and `npm run build` verify source and build.
- `npm test` uses `.env.test.local` and requires an isolated localhost `webdock_admin_test` database. The registry test resets its own local tables; never use production credentials.
- `npm run payload -- migrate` uses `.env.local` and the scoped management schema.
- `scripts/provision.mjs` is an offline operator tool. It takes an explicit owner env-file path and writes private `.env.instance` credentials. Owner credentials must never be deployed.
- `scripts/seed.ts` requires an explicitly approved central subject for production, or a password for a disposable local test account. It creates the initial customer/project inventory without deploying any customer infrastructure.

Initial credentials and MFA enrollment belong to the central auth service. Payload password hashes are never copied into Better Auth. External identity subjects are linked to platform Snowflake projections explicitly.
