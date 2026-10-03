# Webdock

English Next.js 16 / React 19 / Tailwind 4 website and independent Payload 4 Canary CMS at **https://webdock.dev**. Edit content at **https://webdock.dev/admin**.

## Architecture

This Vercel project runs its own Payload admin, authentication, API and frontend. It uses the `webdock` schema in the shared Webdock CMS PostgreSQL database, with a dedicated `webdock_runtime` login that cannot access the other applications' schemas. There is no runtime dependency on the former multi-tenant CMS.

The visible **System operator (Webdock)** account is managed by the platform owner. Customer accounts cannot modify/delete it or grant themselves its role. Existing user passwords were preserved. Each instance has its own sessions and Payload secret.

Landing page copy, SEO and FAQ are editable in Payload. The public website reads its local Global server-side. English copy, local assets and system/light/dark appearance remain intact.

## Development

Use Node 24. Copy `.env.example` to `.env.local` and supply this instance's credentials, then run `npm ci` and `npm run dev`. Never use the database owner credentials in the application. Environment files are ignored by Git.

For migration tooling, put credentials in `.env.instance`. `npm run cms:migrate` runs checked-in schema migrations from `src/migrations-instance`; automatic schema push is disabled. Run migrations explicitly before deploying a schema change. Existing framework IDs and references are preserved; the future platform ULID/Snowflake decision is separate.

```sh
npm run lint
npm run build
npm run start -- --port 3104
# Another terminal:
TEST_BASE_URL=http://localhost:3104 npm test
```

## Operations and rollback

The previous central database's `public` schema, private export and backup are retained. Imported content and history came from the latest central export; do not rerun the one-time import against an edited instance. Rollback requires reconciling changes since cutover before restoring the old deployment/environment. Never point this app's migrations at another site's schema.

Each website keeps its own frontend and `/admin`. The future Webdock management panel will register customers/projects and optionally provision CMS instances; CMS activation defaults off. That customer-facing panel is not built here. Per-site Plausible tracking remains planned.
