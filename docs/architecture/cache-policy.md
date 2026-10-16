# Console read-cache policy

The API caches authorized presentation data in Dragonfly. It does not cache an authorization decision. Every request verifies its current session, user security state, and resource access before looking up a cached view. Registry reads additionally retain their final live operator check before returning. Browser and HTTP responses remain private/no-store; React.cache only deduplicates reads inside one server render.

Cache keys include the deployment environment and immutable release, view kind, authorized scope (including subject/session where applicable), normalized query options, and a database revision for every source table. TTL is a storage bound, not the invalidation mechanism. Committed INSERT, UPDATE, DELETE and TRUNCATE operations change source-table revisions through database triggers, including writes outside the API. A transaction that rolls back does not invalidate. Reads after an uncommitted source write in their own transaction bypass the cache. A bounded periodic prune removes old ledger events and rotates the affected revision epochs atomically; it runs even when data caching is disabled. A delayed old read can only fill its old revision key. Related records are dependencies: renaming a customer invalidates populated projects and CMS records; renaming an operator invalidates populated activity records.

The default view lifetime is 60 seconds; operational views explicitly use shorter bounds as listed below. Cache failures load from PostgreSQL; they never make authorization succeed or return a stale fallback. Without the revision migration the cache stays disabled. Once enabled, database revision failures fail the request rather than hiding a database error inside an aborted transaction. Errors are not stored. Preview requests use their restricted read path and cannot reuse an operator's tenant list.

## Route-family inventory

The policy applies to the shared data readers behind all Console pages, including the parallel toolbar and navigation routes. A page can combine a cached directory with live operational data.

| Pages / read family | Read policy | Invalidation / deliberate live-only reason |
| --- | --- | --- |
| Customers directory and customer profile; project directory and registry project settings | Authorized registry `find`, `findByID`, `count`; 60-second Dragonfly view keys | `webdock_admin.customers`, `projects`; populated project views also depend on customers. Queries retain page, sort, filters, selection and depth in their keys. |
| CMS instance registry | Authorized registry views, 60 seconds | `webdock_admin.cms_instances`, `projects`, `customers`, including two-level populated relationships. This is registry metadata, not editable CMS content. |
| Activity and registry operator directory | Authorized registry views, 60 seconds | `webdock_admin.audit_events`, `users`; populated actors use the same public-column allowlist as an uncached query. Password hashes and authentication secrets never enter the cache. |
| Toolbar, workspace switcher, navigation, tenant landing | Authorized `listTenants` summary, 60 seconds; same-render React deduplication | `webdock_admin.customers`, `webdock_auth.user`, `member`, `tenant_customer`. Summary fields are only id/name/status/role. Preview remains restricted and cannot enable management links. Full tenant profile/team/site claims are live. |
| Operations and infrastructure | `operations.overview` 15 seconds; `clusters.list/get` 5 seconds; detailed operation results and logs stay live | Operations depend on hosting apps/operations and registry projects/customers. Clusters depend on hosting cluster/agent rows. Display-only heartbeat health can age by at most 5 seconds; writes and cancellation still check live state. |
| Hosting project overview, applications and project context | `projects.overview` 10 seconds, `projects.get` 60 seconds, `projects.list` 30 seconds; live authorization outside the cache | Overview dependencies include project/app/setup/Git source/repository/database/binding/backend readiness and Mail key/connection/domain/platform-setting rows. Project context depends on projects/customers; project listings also include hosting assignment/cluster dependencies. Provider, configured state and management permissions are derived from live authorization. App detail, environment and live logs remain uncached. |
| Database pages and viewer | Metadata may use an explicitly authorized view; viewer permissions, launch codes, credentials, session inspection and SQL results stay live | Database lifecycle/credential changes and revocation take effect immediately. Gateway inspection shares only concurrently pending work; it never reuses a settled authorization result. Customer SQL and schema inspection results are never stored in the API view cache. |
| Deployment setup, builds, Git, integrations and provider status | Setup forms, source inspection, build logs, OAuth and provider synchronization stay live | Forms carry revision-sensitive state, and external providers can change without a local DB write. Local directory metadata can only be added with complete DB dependencies and a documented external refresh contract. |
| Billing, offers, plans and usage | Operator `getPlans` / plan-template catalog is an explicitly authorized 60-second view. Billing authorization, quotes, checkout, invoices, subscriptions, quotas and admission stay live | A cached presentation value must never authorize a purchase or resource allocation. Provider webhooks, environment, currency/product versions and customer scope would all be required dependencies. |
| Mail sending, domains, keys, inbox, analytics and service settings | Live service reads by default; no blanket command caching | Delivery/health/provider changes, inbox content, one-time key displays and revoke/suspend checks have different freshness requirements. Secret/API-key material and message contents are excluded. |
| Website content, Canvas, shop, calendar and requests | Live CMS bridge reads and writes; no cross-request cache of editor data | External CMS content changes are not covered by the platform database revisions. Drafts, version conflicts, personal customer records and moderation state remain authoritative. |
| Authentication, account settings, access, sessions and tenant preview | Live; only identical validation within a single request may be shared | Password, MFA, email verification, account disablement, membership, session deletion and preview expiry must be observed on the next request. No native session, token, password hash, credential or authorization decision is cached. |
| Public branding | Separate public presentation cache | It contains no authenticated data; platform-setting revisions must invalidate it, with TTL bounding storage. OAuth consent and session endpoints remain live. |
| Mutations and destructive-action previews | Live; no cache of form actions or their result | Revision checks, side effects, idempotency, audit events and deletion dependencies belong to the write transaction. Successful committed writes invalidate through DB triggers rather than manual per-page cache clearing. |

## Registry dependencies and boundaries

Registry collection dependencies are deliberately conservative across all depths:

| Collection | Revision tables |
| --- | --- |
| customers | `webdock_admin.customers` |
| projects | `webdock_admin.projects`, `webdock_admin.customers` |
| cms-instances | `webdock_admin.cms_instances`, `webdock_admin.projects`, `webdock_admin.customers` |
| audit-events | `webdock_admin.audit_events`, `webdock_admin.users` |
| users | `webdock_admin.users` |

The internal REST `listRecords`/`getRecord` readers remain live: they return native Date objects and `getRecord` also serves mutation preflight checks. Console directories use the JSON-shaped registry `query` interface, which is cached without changing date serialization.

A warm registry hit still opens the signed RLS transaction, verifies the live operator and mapped local operator, reads the source revision, and checks operator access again before returning. Registry sessions and mapped-user authorization are not derived from cached directory rows. Tenant summaries similarly obtain the current actor before cache lookup. Existing HTTP transport remains no-store.

Before enabling another family, identify the public response fields, live authorization boundary, all database and external dependencies, and a regression that proves a warm hit skips work while a committed write and revoked access cannot return the old view. Whole `studioCall`, `hosting.command`, billing, Mail or CMS dispatchers must not be cached indiscriminately.
