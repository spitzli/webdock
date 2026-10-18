# Native Mail runtime boundary

Native Mail business logic now lives in `modules/mail/src/server/native-*`. The API paths and exported function names remain compatible; files in `apps/control-plane/src/modules/mail` compose typed factories with existing identity, hosting transaction, platform settings and provider adapters.

## Extracted ownership

The module owns explicit native-service activation and retained-instance resume; agent claims, checkpoint/completion proofs and generation checks; mailbox/domain/grant configuration and reconciliation; native API keys; managed/BYOK relay setup; submission configuration and certificate proofs; send admission, payload leases, quotas/budgets, handoff and cleanup; webmail launch/session/grant validation, writes, sending and filing; native gateway request handling; and native mailbox/send/budget schema definitions.

`native-access` remains the existing identity-directory-based policy. `native-ports` defines stable local session references, database query/transaction contracts, the authenticated agent reference and verification port, installation gate, platform settings, envelope parsing/environment checks and provider credential interfaces. Individual factories receive only the ports they use. Connections and transactions remain explicitly scoped by application composition; provider clients are constructed only in the API adapter composition. No module imports application internals or provider implementations, and no mutable global service locator is introduced. Environment configuration is supplied to each factory instead of read from a module-global environment.

Schemas, query order, row/advisory locks, idempotency keys, budgets and signed proof checks were preserved during extraction. Existing native SQL retains the deployment's local identity projections and does not constitute an identity/schema migration. Agent transport, transaction ownership and HTTP session mapping remain host responsibilities. The API's existing exports are compatibility wrappers, not a second implementation.

## Lifecycle invariants

Outgoing-only Mail still bypasses Stalwart. Only explicit incoming activation requests a native instance. A draining installation rejects the first activation while allowing resume of retained suspended instances. Suspension retains credentials, volume and identity bindings; deletion remains a separate explicit workflow. Configuration and send operations keep their existing reconciliation behavior after uncertain provider responses. No secret is moved into browser state, and provider credentials remain bound to the original customer/account/revision.

## Verification

`modules/mail/tests/native-runtime.test.ts` covers independent factory configuration, first activation versus retained resume while draining, authenticated agent verification before protected reads, and authorization before provider credential issuance. Existing API-native agent/mailbox/key/relay/webmail tests continue importing the unchanged API exports and should run against the disposable API fixture. The module boundary tests check for application/provider imports. Run the API typecheck to validate composition signatures.

No production migration, customer operation or deployment is performed by this extraction. Database fixtures and end-to-end signed-agent/send tests remain required before release; static checks alone do not prove external delivery.
