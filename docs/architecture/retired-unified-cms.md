# Unified Webdock CMS

Payload 4.0.0-canary.37 at **https://cms.webdock.dev**. Customer websites stay separate Next.js/Vercel projects. A Tenant is an organisation; a Site is a website. Each Site has an explicit content model, enabled modules, languages and its own technical credentials.

## Boundaries

- `super-admin` is a platform role. Normal users have a `member` role and tenant memberships (`tenant-admin`, `editor`, `reader`). Members can read their tenants; editors can edit content; tenant-admins can also update permitted Site settings. Domain/model/module changes and membership assignments remain platform-managed. Tenant deletion is disabled.
- The **Site** selector narrows the admin UI and available content collections. It never grants access. Users and technical credentials are separate collections. Users administration is no longer hidden by the old tenant list filter.
- Every content record has a validated `site` and matching `tenant`. Module checks apply on read/write, including direct REST calls and version queries. Structured and Lexical relationships must stay inside the same Site.
- Integrations authenticate using `integrations API-Key <key>`, bind to exactly one Site, and carry explicit `content:read` or `forms:submit` scopes. They cannot manage people, tenants, credentials, or their own permissions. Public content reads exclude drafts.
- Public media live in Vercel Blob; new UUID filenames and site prefixes prevent overwrites. New uploads require permission confirmation. No confidential-file feature is implemented.

## Current content models

| Site | Model/modules |
| --- | --- |
| Webdock | Landing page with embedded FAQ; pages/faqs |
| Spitzli | Localized portfolio/projects, clients, media, website settings; projects/media/site-settings |
| Stall Eichenbruch | Existing block pages, navigation, business settings, media, redirects and forms |

No horse-profile module exists. Models select the relevant editing schemas; frontends retain their own design. Adding an unrelated domain model means adding a scoped module, not overloading existing fields or building a generic JSON page builder.

## Content and preview contract

`GET /api/content/v1/sites/:siteKey/:resource` with an integration key. Resources are model-specific: Webdock `landing`; Spitzli `settings`, `projects`, `projects/:slug`; Stall `settings`, `header`, `footer`, `pages`, `pages/:slug`, `redirects`, `forms/:id`. Localized resources accept a Site-enabled `locale`. Unsafe/private fields are excluded from delivery. Responses are private/no-store; frontends can cache public content by Site/language/key. Stall currently refreshes public content within 60 seconds; previews are never cached.

Preview links are HMAC-signed, bound to a Site and slug and expire after 10 minutes. A valid preview token still requires the Site's integration credential. Stall validates through the CMS before creating its HTTP-only preview session. Maintenance access and draft preview remain separate capabilities.

## Forms

`POST /api/actions/v1/sites/:siteKey/form-submissions` requires a separate `forms:submit` key. The website server supplies a trusted client IP; the CMS validates the form belongs to the Site, known/required fields, sizes and email/header boundaries. An atomic Postgres limiter allows five requests per 15 minutes. Messages are saved before notification; failures stay visible with a failed delivery state. No message contents/IP addresses are logged. Mail is sent from the configured verified Webdock sender to the fixed Site contact email, never an arbitrary submitted recipient.

Spitzli retains its existing independent hCaptcha + PostgreSQL limiter + SMTP contact endpoint. Its former database is used only by that limiter; content comes from this CMS. Contact forms never use the content-reader key to send mail.

## Operations

```bash
nvm use
npm ci
npx vercel env pull .env.local
NEXT_PUBLIC_SERVER_URL=http://localhost:3110 npm run dev -- --port 3110
npm run lint
npm run build
```

Schema push is disabled. Migrations are committed and run explicitly with the direct Postgres URL:

```bash
npm run cms:migrate
npm run cms:types
npm run payload -- generate:importmap
```

For a fresh isolated database, supply `.env.bootstrap`, run `npm run cms:seed` and provision Sites with `npm run cms:sites`. Import scripts require their private source snapshots and never overwrite source databases. The original databases and the ignored `.backups/pre-unified.dump` are retained for rollback. Do not blindly run down migrations or restore a backup over newer editor changes.

The import scripts preserve source publication states and historical timestamps. Source snapshots/ledgers, bootstrap passwords and integration keys are ignored by Git. Production and development initially share the provisioned central database; use an isolated branch before destructive experiments. Isolation tests create and clean only their own temporary records. Real-database form verification is opt-in and mocks the mail transport.

```bash
TEST_BASE_URL=http://localhost:3110 npm test
CMS_FORM_INTEGRATION_TEST=1 npm test
```

Initial login: `dominik@spitzli.dev`; initial password is in the local `.env.bootstrap` file. Frontend environment variables: `CMS_URL`, `CMS_SITE_KEY`, `CMS_API_KEY`; Stall additionally uses `FORM_API_KEY` and its private maintenance bypass key. No per-site `/admin` redirects are required.

## Follow-up

- Tracking module for Spitzli, Webdock and Stall: per-Site activation and validated Plausible script configuration (explicit user TODO; not implemented in this migration).
- Automatic cache invalidation can replace the bounded public TTL when needed.
- Scheduling workers, customer self-service invitations, billing and domain automation are separate features, not implied by adding a Site.
