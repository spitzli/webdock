# Mail runtime boundary

Source checkpoint: 2026-10-15. This is an application-code extraction, not a deployment, provider migration, database migration, or incoming-mail activation.

## Ownership and composition

`modules/mail/src/server` owns the product runtime: tenant account provisioning and reconciliation, provider credentials, BYOK onboarding and binding, sender domains, tracking, consumer-key controls, submission and dispatch, batches, schedules, quotas, rate limits, idempotency, canonical events, callback inboxes, webhooks, jobs, reconciliation, retention, message/content reads, analytics, resource lists, API keys, HTTP handlers, Studio dispatch, OpenAPI, and the explicit legacy snapshot import. It also owns the deadline-aware Mail database wrapper. Compatibility paths under `apps/control-plane/src/modules/mail` construct these services or re-export module contracts; their exported call signatures and protocol routes are preserved.

API composition supplies the local tenant/session authorization functions, authenticated and signed database scopes, database pool, transaction execution, platform settings, module admission checks, encryption/decryption, import pool creation, and concrete provider transports. These are typed factory arguments, captured per service instance. There is no global mutable service registry and no module import of API application code or concrete adapters.

The native mailbox/infrastructure runtime has separate `native-*` boundaries. Its extraction and application composition should be assessed independently from the product runtime listed above. Console component ownership, application routing/mounts, central worker dispatch, and platform integration configuration are distinct boundaries; this change does not by itself move their ownership.

## Contracts

- `provider-ports.ts`: `MailProductStore`, `MailSecrets`, durable opaque account identities, account management, credential issuance, consumer keys, sender domains, send outcomes, account verification, and fetch contracts. The account and key field names preserve the existing protocol contracts rather than translating or rebinding stored resources.
- `tracking-provider.ts`: tracking settings/domain DTOs and the `MailTrackingProvider`/`MailTrackingFactory` ports.
- `tenant-mail.ts`: `TenantMailDependencies` defines local tenant/session access, authenticated database scope, settings and admission. Definitive creation rejection is classified in API composition with the concrete provider error class; all uncertain failures retain the reservation.
- Product services declare only the database, authorization, secret or peer-service methods they use. Peer-service signatures are derived from module factory return types, so callers cannot silently lose result fields or argument validation to an untyped function map.
- `product-store.ts` takes a PostgreSQL pool supplied by the host. It preserves the original deadline transaction, timeout, rollback and connection-destruction behavior. `product-import.ts` receives its source-pool constructor; the existing read-only source configuration and destination transaction remain enforced by the importer.

`adapters/mail/turbosmtp` implements the account, credential, consumer-key, domain and tracking interfaces. Send and verification transports are checked against their module function types at API composition. Credentials stay explicit invocation arguments; importing an adapter creates no provider session.

## Preserved invariants

Provider account IDs, customer/connection bindings, revision checks and domain observations remain authoritative. The module does not look up a replacement account by email or silently switch an existing connection. Scoped keys still use the same encryption context and version. Creation is reserved before provider I/O, authorization and binding are rechecked before persistence, and uncertain creation or failed old-key revocation leaves reconciliation work rather than issuing another key automatically.

Dispatch claims, lease checks, advisory locks, idempotency replay, quota reservations, callback deduplication, monotonic content expiry and webhook outboxes remain unchanged. The API still supplies the existing RLS-aware pools and request/job scopes. Module configuration is not tenant authorization.

No Stalwart instance is provisioned for outgoing-only Mail. Incoming activation, retention on suspension, managed Contabo placement and encryption-key preservation remain governed by [the deployment decision](mail-deployment-decision.md).

## Verification and limits

Module tests exercise bound-account checks, scoped credential permissions, encryption context, repeated transaction authorization, uncertain provider creation, pre-existing operation fences, access denial and definitive-versus-uncertain account creation. The existing cross-boundary tests prohibit application or adapter imports from module source. API type checking verifies the actual composition contracts. Existing provider/product regression suites continue to import the compatibility paths, exercising the extracted runtime through its real composition.

At this checkpoint the extraction worker ran API type checking, all 27 module tests, and API unit tests (74 passed, one existing fixture-only skip). Disposable PostgreSQL regression execution is coordinated by the parent task; this note does not claim those results before that execution finishes. No live provider call, deployment or production database change was performed for extraction.

Remaining work outside this slice includes full module-owned Console UI, integration-instance management beyond the preserved binding model, and a second production provider. Existing product-specific environment switches and PostgreSQL schemas remain compatibility contracts; this is not a database-neutral runtime or dynamic module hot-loading implementation.
