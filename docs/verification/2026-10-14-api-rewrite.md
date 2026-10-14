# API rewrite verification — 2026-10-14

Implementation is in the `t3code/6fec013f` worktree, based on `95fc3b2ed4317f4d19bdba2c05530ae217924574`. This record separates tested code/local operation from the production rollout. See [API operations](../operations/api-cutover.md), [Polar operations](../operations/polar.md) and [sanitized real sandbox evidence](2026-10-14-polar-sandbox.json).

## Implemented

- Native Bun1.4.3/Elysia1.4.30 API, explicit protocol ownership, FSR preflight, preserved issuer/passkey/cookie semantics, trusted ingress normalization, scoped PostgreSQL/Drizzle and strict readiness.
- Auth/Studio backend callers moved into API domains: registry/access/plans, CMS/Canvas/Shop/calendar, Mail, hosting, databases, provider integrations, MCP and durable project deletion. Stable string IDs and existing encryption contexts are retained.
- [All523 inventoried source files](../superpowers/plans/2026-10-13-api-rewrite/implementation-inventory.json) have a recorded current target or explicit retirement.
- HTTP-only Next.js Auth and Studio, native SSO aliases, preview read/exit behavior, safe account mapping and removal of Payload `/system`/backend dependencies from Studio. Transitive import-boundary checks include configs and proxy entrypoints.
- Separate least-privilege worker profile, durable jobs/leases/checkpoints, non-authoritative optional cache, guarded offline migration/role/operator tools, retired duplicate owner migrators and new deployment templates/runbooks.
- Polar connection/endpoint rotation, immutable catalog versions, drift checks and archive/readback; hashed private offers; accepted agreements and one checkout attempt; encrypted webhook inbox; generation/claim-bound reconciliation; paid-order-gated service status; one-subscription amendments; manual-base fencing/release; operator read retries and customer portal.
- Twenty additive migrations; no automatic live price creation, publication, sales or enforcement. Sandbox cannot project live tenant allowances. No financial history deletion.

## Automated checks

All commands used Node24.21.0 and workspace Bun1.4.3. Fresh PostgreSQL18 basic and signed-RLS fixtures were built from source and the full migration/policy installation completed. `npm ci --ignore-scripts --dry-run` accepted the lockfile; this is a resolution check, not a claim of a second fresh installation.

| Check | Result |
| --- | --- |
| API unit tests |48 passed,0 failed; includes ingress/raw-body, route preflight, cache fallback, worker isolation and frontend boundaries |
| API native integrations |10 passed,0 failed, including real Better Auth password/MFA/OIDC/session revocation and actual PostgreSQL adapter behavior |
| Ported API regressions |282 passed,4 opt-in skips,0 failed |
| Restricted-role suite |All selected Bun role suites passed; all4 opt-in legacy PostgreSQL isolation suites passed separately |
| Studio UI tests |37 passed,0 failed |
| Auth UI tests |8 passed,0 failed |
| Shared API client |3 passed,0 failed |
| Shared SSO |15 passed,0 failed, including existing CMS-compatible mapper behavior |
| API/Auth/Studio |Typechecks and production builds passed |
| Lint |Auth clean; Studio0 errors,3 non-blocking warnings (one unused action-state parameter and two existing unused lint suppressions) |
| Compose |Configuration validates with no interpolation or private-env resolution |
| Diff hygiene |`git diff --check` passed; private environment and test artifacts excluded from version control |

Important regressions include wrong RLS signing key, revoked operator/MFA, cross-customer and preview writes, immutable IDs/conditions, scoped last-owner rules, deletion fences and lost/competing lifecycle claims, conflicting webhook bodies, unknown external-write responses, stale generations/leases, exact tax/price matching, paid initial invoice, unpaid upgrade, scheduled downgrade, repeated cancellation and explicit manual release. The final reconciliation test has61 assertions across sandbox/live simulations. Actual SDK transport tests cover OAT request bodies and archive recovery/republish refusal.

## Actual sandbox exercise

The owner supplied a sandbox organization and explicitly authorized autonomous testing. Credentials are only in the private ignored local environment file; this report contains no token, webhook secret, customer-session token or checkout/portal URL.

The exercise used a separate local database, current root/customer identities, a restricted worker and a temporary HTTPS receiver exposing only the signed sandbox webhook path. The provider organization, read scopes, OAT writes, webhook URL/version/events, immutable product and price were checked against actual responses.

1. Published a clearly named EUR1/month sandbox product. Created one accepted agreement and checkout. Used Polar's documented Stripe test card in the hosted checkout; no real money moved.
2. Actual signed HTTPS deliveries reached the native receiver and worker. A paid initial order activated sandbox service. Live subscriptions and tenant-plan writes remained zero.
3. Upgraded the same provider subscription to EUR2/month. The separate EUR1 proration invoice was paid before the amendment became applied. Original agreement/history and subscription identity remained intact.
4. Scheduled a downgrade to EUR1/month for2026-11-14. It remained scheduled until cancellation; real month-boundary execution was not waited out. The exact-boundary behavior is independently exercised by local role tests.
5. Issued a customer portal session only after disabling provider-side plan/seat/unit/pause self-changes. Performed cancellation at period end through the actual portal. Then revoked only this disposable test subscription to test terminal handling immediately. Agreement/service became ended; paid orders remained retained; the unapplied downgrade closed with `subscription_ended`.
6. Killed the real main worker during a claimed read. Restarted it without bootstrap credentials; after the original lease expired, the same job succeeded with attempt2.
7. Requested redelivery of an already processed `order.paid` event through Polar. The actual provider reported HTTP200 for that duplicate, with no second payment/order/projection. An unsigned request returned403; other API paths on the temporary receiver returned404.
8. Disabled sales/publication, archived the three owned test product versions, and disabled the temporary provider endpoint. Retained customer, orders, agreements and audit history. Portal self-change restrictions remain configured for this sandbox organization.

The browser exercised local native-session → PKCE SSO → customer Billing → Server Action → hosted Polar checkout and the actual customer portal. Synthetic session bootstrap is not claimed as a fresh browser password/MFA enrollment. Mobile Billing was inspected at390px with no horizontal page overflow. The new return handler was browser-checked to retain sandbox and remove the provider session-token query before rendering UI.

## Findings corrected during verification

- Repeated sandbox cancellation incorrectly reclassified an ended agreement as paid-needs-review; regression failed before the fix and passes afterward.
- The fresh reviewer also suspected a unique-index conflict from migration0005. Migration0014 already excludes paid-needs-review from exclusive ownership; that finding was not present in the final schema. Added a two-agreement regression proving late payment records and replacement activation coexist.
- Real Polar OAT writes reject an explicit `organization_id` body. Endpoint/product creation now rely on token authority and still verify response organization. An initial definitive422 was reviewed against the complete remote inventory before a supervised sandbox retry; no duplicate endpoint was created.
- Cache offline-queue settings required an explicit connection before the first read. Real Dragonfly authenticated hit/outage tests now pass.
- Browser-native forms with `no-referrer` emitted `Origin:null` and were correctly rejected by Next.js. Relevant form documents use `same-origin`; CSRF checks remain enabled.
- Checkout and portal returns preserve environment; new checkout callbacks drop provider session tokens. Legacy accepted URL formats remain valid.
- Scheduled downgrades no longer remain pending after a definitive subscription termination. Archival handles lost responses and rejects republishing without re-enabling the retired mapping.

## Operational evidence and remaining gates

The [final OCI API](2026-10-14-api-container.json) ran non-root with read-only root filesystem, dropped capabilities and no Docker socket. Actual constrained role/schema/HMAC checks passed inside the image and SIGTERM exited0. Dragonfly2.0.2 ran authenticated/non-root/read-only with256MiB data limit,512MiB container limit and one thread; hit and bounded outage fallback passed. These are local runtime checks, not production capacity measurements.

Production host/cluster selection and capacity, current verified TLS/DNS, immutable UI-origin protection, complete real-TLS Auth/passkey/Server Actions/MCP/streaming ingress, restored production schema comparison, pool-overlap budget, backups/restore, old-writer drain and rollback after new writes remain release gates. No production migration, host deployment, DNS switch or live Polar purchase was performed. The new Auth UI artifact removes the old cron; production deployment must follow scheduler ownership transfer.

The only fresh whole-branch reviewer reported no confirmed Critical finding. Review and verification fixes were tested by the implementer; no repeat reviewer was dispatched. No PR was created or merged. Preserve the current worktree until integration and the production rollout are explicitly scheduled.

## Implementation decisions

| Decision | Reason and consequence |
| --- | --- |
| Keep A/B task IDs and track execution manually | The skill task parser only accepted numeric headings; changing approved IDs would obscure references. Cost: status comes from this record, not parser-generated checkboxes. |
| Treat the later implementation instruction as authorization | The archived planning-only header was historical. No additional scope confirmation was needed. |
| Keep Node24 and install Bun locally | No global runtime was overwritten. Developers must use the workspace-pinned Bun. |
| Preserve signing configuration | An earlier commit attempt was blocked by1Password signing. Staged work is retained rather than silently creating unsigned commits. |
| Reject controller files in FSR trees | Static guards own authorization; ghost directories remain allowed. New controllers must be explicit mounts rather than implicit hierarchy hooks. |
| Scope Next ambient types to Node/React | Bun types cannot silently change frontend fetch types. Bun APIs require the API workspace. |
| Give registry its own signed runtime role | Existing Auth customer grants intentionally omit internal administrative writes. Cost: one additional credential/pool and additive role provisioning before rollout. |
| Keep the corrected0014 financial index | The review objection cited an older migration. Regression proves the actual schema retains late financial facts without blocking the replacement; no unnecessary index change was shipped. |
| Keep integration in the current worktree | The owner requested autonomous completion while unavailable; no merge, push, DNS switch or production cutover was inferred. |

No reviewer-reported minor findings were deferred. The three non-blocking lint warnings are disclosed above.

Commit status: the final signed commit attempts timed out while `/opt/1Password/op-ssh-sign` waited for interaction (confirmed by Git trace). HEAD remains the baseline; all implementation changes are staged. Signing was not bypassed.
