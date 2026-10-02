# Webdock

English landing page and standalone Payload CMS **4.0.0-canary.37**, built with Next.js 16, React 19 and Tailwind CSS 4. The public site retains its own design and system/light/dark theme; `/admin` uses Payload's separate UI.

## Services

- Vercel project: `spitzli/webdock`.
- Neon Postgres: `webdock-payload`, Frankfurt, free plan.
- TurboSMTP: `pro.eu.turbo-smtp.com:465`, implicit TLS, sender `noreply@webdock.dev`.
- Secrets are stored in Vercel environment variables and ignored local env files.
- No multi-tenancy, public registration, customer console, media uploads or public contact form.

## Local development

```bash
nvm use
npm ci
npx vercel link --scope spitzli --project webdock
npx vercel env pull .env.local
NEXT_PUBLIC_SERVER_URL=http://localhost:3104 npm run dev -- --port 3104
```

Use the keys listed in `.env.example` for a separate installation. Never commit real values. Payload packages are pinned together because v4 is a pre-release. Nodemailer is overridden to 10.0.13 to avoid vulnerabilities in the adapter's older dependency.

## Content and access

`/admin` provides **Landing page** tabs for SEO/contact, hero, concept/use cases, about, FAQ and closing copy. Public pages read from Postgres on each request, so saved changes appear without redeployment. The same FAQ data drives visible answers and JSON-LD.

Users are CMS administrators; only authenticated admins can access CMS data or create further users. There is no customer registration. The initial account is `dominik@spitzli.dev`; its generated password is in the local ignored `.env.bootstrap` file. Use the account screen to change it, or initiate a password reset yourself. SMTP connection/authentication has been verified; no test message is sent automatically.

## Schema and initial content

Schema push is disabled in every environment. Migrations are committed under `src/migrations` and run explicitly, using the direct Postgres URL:

```bash
npm run payload -- migrate:create descriptive_name
npm run cms:migrate
npm run cms:types
npm run payload -- generate:importmap
```

For a **new database only**, create an ignored `.env.bootstrap` with `BOOTSTRAP_EMAIL` and a strong `BOOTSTRAP_PASSWORD`, then run `npm run cms:seed`. Seeding preserves existing users and saved landing-page content. Run it before exposing a fresh deployment publicly.

The provisioned integration currently connects the same initial database to production, preview and development. Use an isolated Neon branch/database before testing future destructive schema or content changes. Do not run schema migrations automatically during parallel preview builds.

## Verification

```bash
npm run lint
npm run build
NEXT_PUBLIC_SERVER_URL=http://localhost:3104 npm run start -- --port 3104
# In another terminal:
TEST_BASE_URL=http://localhost:3104 npm test
# Optional local admin write/read/restore check:
TEST_BASE_URL=http://localhost:3104 node --env-file=.env.bootstrap --test tests/*.test.mjs
```

The authenticated check temporarily updates a hero note and restores it. Run it against a test environment. Other checks cover anonymous access denial, blocked account creation, metadata, assets and theme initialization.

## Deployment

After migration and verification, push `main` to trigger the linked Vercel deployment. Ensure all `.env.example` keys are configured in the target environment. Set `NEXT_PUBLIC_SERVER_URL=https://www.webdock.dev` for production so admin links and password-reset URLs use the correct host.

The SVG logo, dock illustration, social image and local font remain in `public/`. Legal/operator content and the backlink from spitzli.dev remain separate follow-up work.
