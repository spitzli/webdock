# Plans, offers and storage usage

## Administrative release

Root operators manage reusable immutable plan templates at `/admin/plans`. Each tenant has `/tenants/<customerID>/usage` for assignment, additional allowances and measured usage. A plan sets the baseline; extras are independent nonnegative quantities and survive reassignment. Unassigned customers retain their existing service behavior. New templates do not mutate existing subscriptions. Decimal MB/GB input is converted exactly to integer bytes; blank base allowances mean unmetered, blank extras mean zero.

Operators create tenant-bound offers, optionally starting from a plan and changing its allowances. Commercial terms are free text for separately agreed/manual billing; this release has no checkout, payment processing or public plan purchase. A 32-byte random link token is shown once, stored only as SHA-256, and never emailed automatically. Offers expire in 1–90 days and can be revoked. Altering issued terms requires a replacement offer.

The intended tenant's authenticated customer administrator explicitly accepts the offer. A link does not create an account or grant membership: invite-only onboarding remains in force. Operator preview does not let the operator impersonate customer acceptance. Acceptance records actor/time, preserves the issued extras snapshot, atomically assigns the plan and adds an immutable application-level revision history entry. Intervening assignment/extra changes invalidate pending offers. Repeat acceptance is idempotent and never reverts a later subscription. Advisory transaction locks serialize tenant plan changes; fresh locked identity/membership/customer reads guard authorization.

## Measurement versus enforcement

Plan quantities in this release are recorded allocations. They do **not** yet enforce CMS storage, transfer, website/editor creation or update turboSMTP quotas automatically. The UI states this explicitly. The existing Mail management page still controls the provider's actual quota; usage displays that quota, provider period and observation time separately from the plan allocation. Transfer measurements are unavailable until a suitable authorized provider source exists.

Storage mappings are operator-only, encrypted server-side and explicitly assigned to tenants. Existing store IDs and matching read/write tokens are required; the form does not provision stores. Tokens are purpose-bound with `storage:<mapping UUID>` using the platform encryption key. Exact normalized directory prefixes prevent adjacent-prefix inclusion. Overlapping store/prefix claims are rejected globally, while disjoint legacy prefixes may coexist.

Complete Blob metadata listing counts originals, generated image variants and other retained objects in the mapped prefix. Traversal is capped at 100 pages of 1,000 objects, 32 MB of parsed metadata and 30 seconds. Failed/incomplete inventory never replaces a snapshot with zero; old values remain labelled stale and totals become unavailable. This limit is a measurement ceiling, not a provider capacity limit. Removal disconnects the local mapping only and never deletes files.

An authenticated hourly Vercel cron calls `/api/cron/storage-usage`. `CRON_SECRET` is required. Each call atomically claims up to 10 active-customer mappings whose last attempt is older than 24 hours, with two inventory workers. Successful measurements advance the snapshot; failures advance attempt time and preserve the last successful values. Compare-and-set revisions prevent outdated results resurrecting deleted mappings or overwriting newer work. This supports up to 240 due mappings per day before scheduling/batch sizing needs review; timing is a daily target, not real-time accounting. Operators can refresh manually. Public requests to the cron route return 401.

## Existing storage and separation strategy

Production Vercel environment inspection on 2026-10-04 confirms Spitzli and Stall both use `store_K6sG5LN3FZP7MSSj` (`spitzli-media-production`, Frankfurt). Active CMS prefixes are `instances/spitzli/` and `instances/stall/`. Initial complete inventory found 31,422 bytes/3 objects for Spitzli and 25,316,540 bytes/182 objects for Stall. These are timestamped observations, not fixed product limits. Legacy objects outside those active prefixes are not assigned to either customer's media allowance.

The separate existing `stall-eichenbruch-media` store is not the active production token destination. Do not infer usage from its name or delete it. The existing preview store is also not automatically attributed or granted production write access.

Target architecture is separate stores per project and environment, with stable mappings and separate credentials. The present mappings expose the true legacy state, not completed isolation. Physical migration requires verified copy, URL/reference preservation, matching database data, final write synchronization and rollback. It remains separate from this administrative release. Private independent backups with tested restore and a candidate 30-day retention are designed but not provisioned; no backup service guarantee is implied.

## Operations

Apply `apps/auth/scripts/migrate-plans.ts` using the auth runtime environment before deployment. The additive schema contains plan templates, tenant subscriptions, offer snapshots, subscription history and storage measurements. Existing tenant mappings need SELECT/REFERENCES but no new UPDATE grant. Preserve the platform encryption secret or explicitly re-encrypt stored credentials before rotation.

Tests cover wrong-tenant/admin/member/operator access, archived tenants, stale revisions, exact numeric validation, concurrent offer acceptance, historical snapshots, prefix overlap, failed pagination, stale refreshes, concurrent removal, batch claim isolation and cron authorization. Browser QA uses disposable local identities and never sends customer offers or changes production customer plans.

Production QA also exposed transient connection establishment failures while Better Auth eagerly seeded OAuth resources. Auth initialization now starts on first use, observes failed context initialization and discards only the failed instance. A later request can initialize again; the failed caller still receives its error, and no API write is automatically retried. Tests cover the actual Next.js handler integration, lazy startup, successful reuse and rejection recovery. This protects initialization lifecycle, not a guarantee against provider/network outages.
