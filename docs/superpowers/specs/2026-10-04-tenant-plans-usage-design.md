# Tenant plans, additional allowances and usage

Status: user requested implementation on 2026-10-04, with the extension below. Storage migration/backup provisioning remain staged separately from the initial administrative release.

## Approved extension: individual offers without checkout

Operators create reusable base plans and custom plans, assign them to tenants and adjust extras. They can prepare a tenant-specific offer derived from a base plan, change its allowances and commercial description, and generate a private expiring link to share manually. Do not send mail automatically. Offers are immutable after issue; revoke and replace to change terms. Prices, when entered, are descriptive manual-invoicing terms; there is no public checkout, charge or payment confirmation.

The intended tenant's authenticated administrator can review the exact offer and explicitly accept. Acceptance atomically records the actor/time and assigns its allowance snapshot; retries are idempotent. Token possession alone never grants tenant membership. Expired/revoked offers and wrong-tenant/non-admin users cannot accept. Links use high-entropy secrets with only hashes stored; generation returns the link once. Record the tenant subscription revision at issue and reject stale offers after intervening subscription changes, preventing accidental rollback. Existing extra allowances must be preserved and shown in the acceptance preview.

Initial delivery includes this management/acceptance flow and truthful storage/Mail usage display. New plan allocations are contractual configuration, not falsely advertised as fully enforced capacity: show measurement/enforcement status explicitly until every CMS/provider path is integrated. Production media migration, backup destination purchase and paid checkout do not happen implicitly.

## Goal and existing storage

Give each customer a plan as a baseline, with independently adjustable extra allowances, and show actual usage against the effective limits. An operator can increase capacity without forcing a different plan. Customers can see their allocation and request increases.

Code inspection confirms Vercel Blob storage in the independent Spitzli and Stall CMS instances, with prefixes `instances/spitzli` and `instances/stall`. Both generate image variants. The Webdock landing-page CMS currently has no media collection. Retired `apps/cms` configuration is not evidence of an active customer storage mapping.

## Recommended model

Use central plan records and tenant subscriptions instead of scattered limits or a full billing system. Plans contain name and baseline allowances for media bytes, monthly outgoing mail, monthly transfer bytes, website count and editors. Null means explicitly unmetered; zero means no allocation. Keep prices and checkout out of this first implementation because no final commercial offer/payment provider has been selected.

Assignments take a versioned snapshot of the plan baseline. Editing a plan does not silently change existing customer contracts. An operator explicitly applies a new version or changes the assigned plan. Tenant-specific nonnegative extra allowances are stored separately and survive plan changes unless explicitly removed. Effective allowance is baseline plus extras; show all three values in the UI. Existing customers start as unassigned, without applying the speculative Mini limits retroactively.

Example: 500 MB plan + 1,500 MB extra = 2,000 MB available. Use decimal MB/GB consistently, storing integers in bytes. Plan changes and extras require fresh operator authorization and an audit entry. Customers cannot edit their own entitlements. Concurrent changes use revision checks, preventing lost updates.

An override of the whole total is simpler initially but loses the relationship to the booked plan; pure plan upgrades prevent small independent increases. Baseline plus extras is the recommended compromise.

## Measurement and enforcement

### Storage strategy: project isolation

Recommended topology is one public media Blob store per project and environment, connected only to that project/environment. Use stable internal project IDs in the registry; readable store names are labels, never authority. Example labels: `wd-<projectID>-media-prod` and `wd-<projectID>-media-preview`. Create a preview store only when persistent preview uploads are needed. Local development uses disposable local/test storage. Preview deployments must never receive production write credentials or mutate production media; read-only references to already-public production images are acceptable when explicitly configured. Separate preview databases must match this storage isolation.

Within a store, retain compatible Payload media paths and immutable UUID-based filenames, recording original filenames as metadata. Do not casually change the adapter's suffix/path behavior: existing variants and references depend on it. A prefix is an organizational aid, not an authorization boundary for store-wide credentials. Never share a customer's store credentials with unrelated projects. Reuse an existing store when it already meets these requirements rather than creating a duplicate. Actual existing store-to-project/environment connections must be inventoried before claiming isolation; source-code prefixes alone do not prove it.

Alternative: a shared store with tenant/project prefixes reduces provisioning work but gives every holder of its full store credential access across those prefixes. A store per tenant isolates customers but not their projects. The user specifically requested separation per project, so prefer per-project/environment stores.

Public stores contain only intended public website media. Private documents, confidential originals and backups require private storage with authenticated delivery and must not enter the public CMS media collection. Do not provision private document storage until that feature is needed. Store region should be selected near the application's region, preferably an appropriate EU region for these projects; verify actual location and pricing before provisioning. Region selection alone is not a claim that every delivery/processing step stays within the EU.

The root registry records tenant, project, provider store ID, environment, region, public/private purpose, credential reference and measurement status. Customer screens show useful project labels and capacity, never credentials. Existing Payload adapter authentication must be verified against its installed Blob SDK before considering newer OIDC support; no speculative dependency migration is part of this design.

Customer allowance remains a tenant pool (plan plus extras), with actual bytes broken down per project and optional operator-set per-project caps. Physical separation does not require separate customer billing. Preview usage is shown separately as operator overhead by default, with its own small operational limit. Backup usage is recorded separately as platform cost, not silently deducted from the advertised live-media allowance. Show image variants within media usage and explain that optimized copies occupy storage too.

### Backup, recovery and migration

Proposed initial recovery policy: daily incremental copies of changed/new media and matching CMS data exports, retaining recovery points for 30 days. This is a design target, not an existing service guarantee. Use a private backup destination with separate credentials unavailable to website runtimes, preferably a separate account/provider for protection against production credential/account loss. Choose the destination after cost and restore verification; a second folder in the same public store is not a sufficient backup. Encrypt backup contents and restrict restore access to operators.

Each recovery point needs a manifest of object keys, sizes and checksums plus the matching database/export version. Retain older immutable objects while any retained manifest references them. Capture exports and object inventories with a consistency procedure (brief write pause or verified change capture) so backups do not reference missing/replaced uploads. Failures alert the operator and show the last successful recoverable point. Test project-level restores into isolated storage/database before claiming backup coverage. A successful daily schedule targets up to 24 hours of data loss; alert on missed runs rather than promising that target unconditionally. Determine a restoration time target from measured restore tests.

CMS content history is not a media backup. Do not immediately purge objects referenced by retained drafts/versions. Plan reference-aware cleanup with a grace period and explicit treatment of old published URLs. Avoid promising a customer recycle bin until restore and retention behavior are implemented. Account deletion/export must include a documented backup-expiry policy.

For existing shared or incorrectly connected stores, inventory first, copy objects to the destination, verify counts/bytes/checksums, then update all affected CMS references (including rich text, blocks and versions) and image-host configuration. Account for concurrent writes with a controlled final sync. Verify rendered pages and rollback before removing old objects. Old public URLs may exist outside the CMS; retain old hosting until an agreed migration/deprecation policy resolves them. No store deletion, production image move or credential cutover is authorized merely by this design amendment.

Official references checked 2026-10-04: [Vercel Blob stores and environment connections](https://vercel.com/docs/vercel-blob), [Blob access/security](https://vercel.com/docs/vercel-blob/security). These describe platform capabilities, not the current deployment's verified wiring.

Maintain explicit operator-controlled mappings from tenant to website and Blob store/prefix. Never infer ownership from display names. Aggregate all mapped websites for a tenant. Credentials stay server-side with the infrastructure that owns them.

Media usage sums real stored objects under the mapped prefix, including generated image variants and retained files. Reconcile paginated Blob inventory against CMS metadata. Show measurement timestamp and errors; unavailable or incomplete measurements must never appear as zero. Old usage remains visible as stale. Metadata-only totals may be displayed only as labelled estimates until reconciliation succeeds.

Storage admission must cover native Payload upload paths as well as the custom CMS UI. Reserve bytes atomically for simultaneous uploads; reconcile actual stored originals/variants after success and release failed reservations. Handle replacement, regeneration and deletion without double-counting. Expired reservations require reconciliation before reuse. At the cap, block additions; preserve existing media and allow deletion. Reducing an allowance below current usage requires an explicit warning and never deletes content. Do not claim enforcement until these paths are covered on every mapped instance.

Mail reuses the existing child-account usage and provider quota integration. Display provider period, last refresh and confirmed effective quota separately from a requested limit. Apply increases through a pending/succeeded/failed synchronization state; failed provider updates must not appear active. Direct SMTP/API credentials bypass Webdock, so limits must be enforced at turboSMTP. Verify monthly reset/count semantics before labelling usage as monthly. Never reset sent counters on plan changes. Existing account quotas stay intact until an explicit assignment/sync.

Traffic starts as unavailable unless a reliable tenant-attributed provider source is configured. Existing Vercel read scopes do not establish billing/usage access. Do not fabricate values or equate page views with billable transfer. Distinguish observed usage from enforceable limits. Additional source permissions and a traffic enforcement policy need separate verification.

## Interface and increase workflow

Root administration manages plan templates. Tenant details link to “Plan & usage”, available to tenant members with the same current authorization and archive rules as existing tenant pages. Show storage, mail and available measurements as accessible progress indicators and numbers, including baseline, extras, total and freshness. Operators can assign plans and edit extras with validation and before/after confirmation. Warn at 80% and 100%; unknown/unmetered values get explicit labels instead of misleading progress bars.

For the first release, tenant administrators can submit an increase request specifying resource and desired extra allowance. Operators review requests centrally and apply the resulting allocation. Members cannot request or approve changes. Requests do not activate capacity or create charges. Automated self-service purchase is a separate billing extension requiring explicit prices, payment confirmation and idempotent payment-to-entitlement handling.

## Verification and rollout

Verify tenant isolation, operator-only writes, stale authorization rejection, plan snapshot/extras behavior, simultaneous edits/uploads, complete inventory pagination, failed reconciliation, variant/replacement accounting and provider quota failures. Verify mobile tenant/root interfaces and existing CMS uploads. Roll out schema changes additively, then mappings and read-only measurements, then explicitly assigned allowances and enforcement. Retain existing service access for unassigned customers throughout.

Acceptance: an operator can assign a baseline and independently increase a customer's allowance; customers see correct scoped usage and can request an increase; displayed active limits match enforced provider/app limits; missing data is clearly marked; no checkout or automatic charge is implied.
