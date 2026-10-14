# Webdock documentation

Mintlify root: this `docs/` directory. Configure the Mintlify Git connection for
`spitzli/webdock`, branch `main`, and directory `docs`.

## Local preview

Use Node.js 24:

```sh
npm install -g mint
cd docs
mint dev --no-open
```

## Checks

From the repository root:

```sh
bun docs/scripts/export-mail-openapi.ts --check
```

From `docs/`:

```sh
mint validate
mint broken-links
```

## Structure

- `index.mdx`, `quickstart.mdx`, `guides/`: customer and product documentation.
- `developers/`: authentication, MCP, registry, Mail, CMS and contribution guides.
- `openapi/mail.json`: generated Mail API reference with 29 operations.
- `docs.json`: navigation, branding and API-reference configuration.
- `.mintignore`: explicit publication exclusions.

Internal architecture, operations, plans/specifications, verification records
and UX inventories remain in Git and are excluded from Mintlify. Do not publish
them by merely removing their navigation entries. Do not modify old evidence to
make it appear current; use current source to update the public guides.

## Update the Mail contract

```sh
bun docs/scripts/export-mail-openapi.ts
bun docs/scripts/export-mail-openapi.ts --check
```

The exporter calls `mailOpenAPI()` from `apps/api`, adds readable operation titles
and groups, and resolves the relative server URL to `https://api.webdock.dev/api/mail/v1`.
Paths, authentication, parameters and schemas remain unchanged. Review the JSON change with the source
contract change. The documentation playground is disabled; no live send is part
of documentation validation.

The imported starter's MIT notice remains in `LICENSE`. The site now uses the
existing Webdock logo and icon. Follow `AGENTS.md` and the public documentation
maintenance page when adding pages.

## Content sources

Public guides were checked against the current `apps/api` services and the
Console navigation, with these internal records used for rollout boundaries:

- `verification/2026-10-14-console-domain.md`: browser vs. protocol origins.
- `verification/2026-10-14-api-production.md`: API and frontend ownership.
- `architecture/customer-tenants.md`: membership and website authorization.
- `architecture/studio-integrations.md`: registry and OAuth contracts, checked against current handlers.
- `operations/managed-postgresql.md`: pilot, storage and backup limits.
- `verification/webdock-mail-relaykit-acceptance.md`: Mail implementation vs. release acceptance.
- `operations/polar.md`: accepted agreements and sandbox/live separation.

Do not expose these source records through Mintlify. Recheck current source
and newer rollout evidence when updating a public claim.
