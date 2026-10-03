# Webdock frontend

English Next.js 16 / React 19 / Tailwind 4 landing page at **https://webdock.dev**. Content comes from the separate multi-tenant Payload CMS at **https://cms.webdock.dev**.

## Architecture

- This repository is the public frontend only. `/admin` and CMS `/api` routes return 404; there are no redirects to the CMS.
- The CMS has its own Vercel project, repository (`spitzli/webdock-cms`) and Neon database.
- Webdock is the first tenant. Spitzli and Stall Eichenbruch have not been migrated.
- `src/lib/landing.ts` fetches the tenant's unique landing page server-side using a dedicated read-only API key. The key is never public or passed to browser components.
- The visual design, English copy, native FAQ, local font and system/light/dark appearance remain unchanged. Saved CMS changes appear on the next request.

## Run

```bash
nvm use
npm ci
npx vercel link --scope spitzli --project webdock
npx vercel env pull .env.local
npm run dev -- --port 3104
```

Required runtime variables: `CMS_URL`, `CMS_SITE_KEY`, `CMS_API_KEY` (see `.env.example`). For local integration with the sibling CMS, set `CMS_URL=http://localhost:3105` when starting the frontend. No database or SMTP credentials are used by this app.

```bash
npm run lint
npm run build
npm run start -- --port 3104
# Separate terminal:
TEST_BASE_URL=http://localhost:3104 npm test
```

## Editing

Open https://cms.webdock.dev, select the **Webdock** tenant and edit **Landing page**. Website content and SEO are editable there. The public frontend retains its own components; adding another customer does not require sharing this design.

## Migration / rollback

The source standalone CMS database was retained, not deleted. Commit `ae49dde` contains the previous Payload application and its migration scripts. The central CMS imported the latest saved content before cutover. Restore the old application plus its original Vercel environment configuration only if rollback is required; reconcile any newer CMS edits first. Do not run old migrations against the central CMS database.

Static branding assets are in `public/`; frontend tokens are in `tokens.css`. Legal/operator content and the backlink from spitzli.dev remain follow-up work.
