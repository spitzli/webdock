# Polar production setup

Organization: **spitzli**, ID `900da77a-d11a-4230-873b-e93fbb89b377`.
API: `https://api.polar.sh`. This configuration uses **live production**, not sandbox.

## Implementation

The npm monorepo already uses TypeScript, Bun/Elysia in `apps/api`, and `@polar-sh/sdk` 1.0.2. No adapter or additional SDK dependency was installed. The installed SDK's current versioned `createPolar` and async `webhooks.validateEvent` APIs are used directly.

- `apps/api/src/modules/billing/hosted-client.ts`: one reusable SDK client selected by `POLAR_SERVER`.
- `apps/api/src/protocols/polar-hosted.ts`: `GET /checkout?products=<id>` creates a hosted checkout; `POST /api/webhook/polar` verifies the original signed bytes before acknowledging events.
- `apps/api/src/index.ts`: mounts these routes when the billing domain and environment token are configured.
- `apps/api/tests/polar-hosted.test.ts`: product validation, sanitized failures, raw signature verification and tampered-body rejection.
- Private, ignored `apps/api/.env`: `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_SERVER` (names only).

The hosted checkout has no custom success URL or confirmation page. No new customer-portal route was added: Polar hosts the portal and emails customers its link. Existing Webdock agreement/subscription functionality remains separate. The new `order.paid` and `customer.state_changed` handlers intentionally contain TODOs and do not grant access. Keep this distinction when testing a standalone checkout.

## Provisioned resources

- Product: **Test Product**, one-time **10 EUR**, ID `198f8368-fad6-4da9-bf64-b066b2c9a23f`. EUR replaces the requested USD price with owner approval because the organization requires its EUR default presentment currency.
- Webhook: `6556fb0b-ef66-4d12-9e68-65860bc8b44f`.
- URL: `https://api.webdock.dev/api/webhook/polar`.
- Raw events: `order.paid`, `customer.state_changed`; API version `2026-10`.
- 100% test discount: `10f71467-d9b6-42c4-9c29-daf8ba1bc5c9`. Restricted to the test product, one redemption, expires 24 hours after creation. Its code is stored in the private provisioning record, not source control.

Local checkout: `http://localhost:3130/checkout?products=198f8368-fad6-4da9-bf64-b066b2c9a23f`.
Production checkout: `https://api.webdock.dev/checkout?products=198f8368-fad6-4da9-bf64-b066b2c9a23f`.
Enter the test discount on Polar's checkout page; the plain checkout link does not apply it. Without the discount this is a real paid checkout.

## Verification before merging

- [x] Organization access token read from `.env`; product-list request returned 200.
- [x] Organization ID matches the owner-supplied production organization.
- [x] Existing Webdock connection probe passes locally and in the production API container.
- [x] API typecheck/build and all 55 API unit tests pass.
- [x] Signed order/customer event tests pass; tampered payloads return 403.
- [x] Product and webhook IDs were returned by Polar; webhook signing secret was saved directly to `.env`.
- [x] Deploy the new API artifact with the three private environment keys.
- [x] Production checkout redirects with 302 to Polar; unsigned webhooks return 403.
- [ ] Complete a hosted checkout using the 100% code and verify the resulting webhook deliveries.

A Python urllib probe was rejected by an edge browser-signature rule (403). The Node.js request and the installed SDK, including the production-container connection probe, succeeded. Do not diagnose that specific 403 as insufficient token scope.

## Local development

Use `npm run dev -w @webdock/api` with the existing local database configuration and `WEBDOCK_API_DOMAINS` including `auth,portal,registry,billing`. The full Webdock API also requires its usual DB/auth configuration; the three Polar keys do not replace it. No long-running dev server was started by this setup.

## Webdock catalog

The existing operator-authorized catalog contains 35 unpublished entries from the owner-provided product plan: websites, apps/bots, Connect/BYOK, mail, media/editor add-ons, databases and services. There are 22 fixed-price entries and 13 quote-only entries. The three website prices are yearly and include tax:

| SKU | Annual price incl. tax | Websites | Editors | Media | Emails/month |
|---|---:|---:|---:|---:|---:|
| website-mini-year-v1 | EUR 58.80 | 1 | 1 | 500 MB | 100 |
| website-basic-year-v1 | EUR 118.80 | 1 | 3 | 2,000 MB | 1,000 |
| website-plus-year-v1 | EUR 238.80 | 1 | 5 | 5,000 MB | 3,000 |

These drafts are not published to Polar and are not enabled for sale or operational fulfillment. The separate one-time Test Product above is available in Polar for onboarding. The live organization connection has also been saved successfully through the authenticated Webdock operator API.

The complete source inventory is `apps/api/src/modules/billing/initial-catalog.ts`. Non-website prices follow the source's **net EUR** basis. Price ranges, starting prices and unspecified amounts are quote-only, never zero-price products. Service descriptions preserve the original capacity/backup/SLA limits. Additional websites reuse a website package; customer-specific sponsorships and individual plans are not sold as reusable free catalog products.

Migration `0021_full_catalog.sql` adds services, one-time intervals and nullable prices for quotes. Manual fulfillment is explicit; the existing SQL purchase function remains website-only. Quote-only entries cannot be published to Polar. No additional customer resources, service grants, sales enablement or operational approvals are created by seeding the catalog.

Production readback confirms all 35 catalog SKUs, 13 null-priced quote entries, and no published or operationally approved entries. Existing website rows were preserved; the other 32 were created through the authenticated operator endpoint. The API and worker use image `sha256:67a0baff645f3ee01e63b20892f1b5be9a38e00d385540ce2a36f8a4c51ae480`. Restricted-role MCP catalog persistence, existing checkout and private-offer regressions passed.
