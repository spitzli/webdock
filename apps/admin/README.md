# Webdock operator workspace — development only

This app is part of the public `spitzli/webdock` monorepo. Its local Payload login is a development implementation. **Production authentication and SSO are under discussion; this app has not been deployed.** The empty Vercel project is not connected to Git, and automatic Git deployments are disabled in `vercel.json`.

Customers, projects, existing CMS connections and append-only audit events are implemented. The registry never provisions infrastructure as a side effect of ordinary CRUD. Link an existing deployed CMS using its admin URL and provider references. This does not enable, suspend or delete the external service.

Run commands from the monorepo root with `npm run <command> -w @webdock/admin`, or inside this directory after the root `npm ci`.

- `npm run dev` starts on port 3120.
- `npm run check`, `npm run lint` and `npm run build` verify source and build.
- `npm test` uses `.env.test.local` and requires an isolated localhost `webdock_admin_test` database. The registry test resets its own local tables; never use production credentials.
- `npm run payload -- migrate` uses `.env.local` and the scoped management schema.
- `scripts/provision.mjs` is an offline operator tool. It takes an explicit owner env-file path and writes private `.env.instance` credentials. Owner credentials must never be deployed.
- `scripts/seed.ts` requires either a local test password or an explicit source operator connection. No production account has been seeded pending the auth decision.

The current password-preservation seed path belongs to the development Payload-auth approach. Do not run it for a future Neon Auth deployment without updating the identity design first. External auth-provider IDs should be linked to platform Snowflake IDs, not rewritten.
