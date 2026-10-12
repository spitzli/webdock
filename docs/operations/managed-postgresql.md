# Managed PostgreSQL operations

The first internal production instance is ready for the Webdock tenant as of 2026-10-12. [Deployment and client evidence](../verification/2026-10-12-webdock-postgresql-production.json). The catalog remains operator-pilot only; existing application data has not been migrated.

Implemented v1 is single-primary PostgreSQL 18 with CloudNativePG, a separate bounded ext4 storage pool, and PgBouncer transaction pooling. Shared customers receive separate databases and roles; Dedicated receives its own CNPG installation. There is no HA claim or automatic cross-node volume migration.

**Backups are deferred by the owner (2026-10-12).** No S3 target, Barman, WAL archive, PITR, backup-based clone or restore is configured. UI, API and immutable offer terms must continue to say this. Retained local volumes and migration sources are not backups.

## Provisioning and accounting

Operator: Infrastructure → cluster → Managed PostgreSQL. Register only a qualified, already carved-out database pool. Provision a Shared backend explicitly. Create immutable tariff revisions; availability starts disabled. Pilot and public visibility are explicit operator actions, and public orders additionally require `WEBDOCK_DATABASE_PUBLIC_ENABLED=true` in Auth. No signup or project-creation hook provisions a database.

Customer: tenant → Managed PostgreSQL → project → review order. The price, resource scope and absence of backups are accepted before reservation/provisioning. Dedicated provisions directly after acceptance; Shared requires free slots and logical allowance on a ready operator pool. Repeated order acceptance reuses the accepted order. Billing starts only after the authenticated agent proves actual readiness and verified connections. Pause does not end billing. Cancellation requests are separate from retained deletion; invoice handling remains manual.

Physical promises include paused instances and retained volumes. Shared is reserved once per installation, with logical customer allowances separately bounded. Each installation reserves PostgreSQL plus 200m CPU, 512 MiB RAM and 512 MiB ephemeral overhead. Registered pool disk is reserved globally and cannot also be sold as App storage. Fresh node observations subtract known managed actual requests, then add all held promises plus other workloads.

## Installation sequence

1. Refresh `infra/postgres/inventory.py` and native control-plane reservations. Review deployed source hashes. This branch must not overwrite the separately deployed three-node App storage router or operator SSO changes. Reconcile that baseline first.
2. Use the explicit owner migration runner: `node --import tsx apps/auth/scripts/migrate-hosting-databases.ts /private/owner.env`. The file supplies `DATABASE_URL_UNPOOLED` (or `DATABASE_URL`) and optional `AUTH_DB_ROLE`. Run after existing Auth/Hosting/Mail schema migrations. It is transactional, adds tables and narrowly scoped runtime grants, and enables no offer. Keep owner credentials offline. Never push schema from HTTP or heartbeats.
3. Verify pinned images in `infra/postgres/versions.env` with upstream signatures. Install the pinned CNPG controller in `cnpg-system`; retain the existing cert-manager. Inspect controller health and CRDs before agent capability activation.
4. Carve out a separate pool without a capacity gap: lower approved native App storage allowance first, reduce the selected App helper ceiling while preserving all existing allocations, create the separate DB helper pool, observe it, then restore the approved aggregate ceiling and register the DB partition. Never increase either ceiling above measured disk minus host reserve. Preserve at least the existing production host reserve; pilot's smaller reserve is test-only.
5. Use a root-owned, mode-0600 `/etc/webdock-postgres-storage.json` in the existing storage-v1 configuration shape with its own `root`, `poolID`, node/cluster identity, capacity and reserve. Run `webdock-postgres-storage.service` on the selected DB node with the dedicated socket. Deploy `database_storage.py` alongside a compatible reviewed `storage.py`, `storage_service.py` and `storage_client.py`. The ordinary App service must not get `WEBDOCK_DATABASE_STORAGE=1`. Never substitute local-path requested capacity for an enforced filesystem.
6. The managed agent needs `databases.py` and `database_migrations.py` plus the updated daemon/observer/storage client. The BYOK installer is intentionally separate: this product runs on native managed infrastructure. Do not replace unrelated Mail modules or their keys. Agent configuration `/etc/webdock-postgres.json` must be root-owned mode 0600 and contain exactly `image`, `poolerImage`, `issuer`, `apiCIDRs`, `podCIDRs`, `storageSocket`, `caFile`. Images require version tag AND digest. The CA file contains public certificates only. The selected ClusterIssuer must issue the external hostname and internal service names; the local pilot CA is not a production issuer.
7. Render and inspect `python3 infra/postgres/boundary.py --kubeconfig /private/explicit-kubeconfig`; apply only with `--apply`. Restrictive DB policies are installed before resource-version-fenced App-policy exceptions. Verify CEL type checks and run `check_boundary.py`. Namespace labels are privileged: ordinary App identities may not create/modify namespaces, admission or RBAC. Preserve that existing RBAC boundary.
8. Configure real endpoint DNS and the reserved TCP ports 32000–32199 to the selected node, including host/provider firewall policy. Verify TLS hostname and CA from the external customer path. The current local `.example.invalid` DNS shim is solely test infrastructure. Auth carries management requests, never customer SQL.
9. Start with disabled tariffs and synthetic operator/customer identities. Run the end-to-end flow and the 24-hour bounded pilot before public availability. See qualification evidence; do not mistake local proof for production rollout.

## Connections and credentials

Customers reveal confirmed credentials in Studio only. Generic REST/MCP commands never return passwords. Use direct connections for schema migration, PgBouncer for application transactions, `sslmode=verify-full` and the downloaded CA. Application schema is `app`; Prisma must explicitly select it. Use the migration role for DDL and the application role for DML. Do not disable TLS checks or use the owner/superuser role in an application.

Credentials rotate behind a new revision and become visible only after proof. A failed/uncertain rotation requires reconciliation; do not guess which credential is active. CA changes fail closed against persisted identity. CA rotation requires an overlap trust bundle distributed to clients, a reviewed certificate rollout, verification of direct and pooled paths, and only then removal of old trust. Automated CA rotation is not implemented.

## Pause, restart, resize and migration

Shared pause disables only its two login roles and terminates their connections. Dedicated pause additionally hibernates the primary; storage remains. Resume refuses to replace missing data with an empty database. Restart is fenced by the observed Pod UID. CPU/RAM changes retain installation identity. Larger physical volumes and Shared→Dedicated use an explicit, interruption-accepted logical migration.

Migration reserves the target before fencing the source, uses a non-superuser schema migration role, streams dump/restore, verifies row contents/counts, then switches the customer endpoint and billing. The old source remains fenced for seven days. Neighbouring Shared databases stay available. After the retention deadline, the operator reviews a session-bound source cleanup preview and confirms the exact name; only the old source is purged. Referenced legacy roles are retained NOLOGIN instead of altering foreign grants.

If a job/lease is uncertain, stop and inspect operation ID, checkpoint, Cluster/Job UID and source/target state. Reconcile observes the existing job and never repeats an uncertain import automatically. Keep the source fenced until target integrity is established. If the transfer failed, keep both copies and reservations; this version has no automatic abort/rollback wizard. Do not manually enable both writable copies or edit accepted orders. Resolve under a reviewed operation-specific recovery procedure.

## Retention, purge and rollback

Customer cancellation alone deletes nothing. Operator retained deletion ends service and billing, fences access and starts seven-day retention. Purge requires a fresh five-minute session-bound preview, matching revision, elapsed retention and exact database name. Dedicated teardown checks namespace/PVC/PV ownership and resource versions before helper purge. Shared purge removes only the selected logical database and unreferenced roles. A project with PostgreSQL offer/order history must be archived, not permanently deleted.

For control-plane rollback, disable catalog availability, stop new DB claims and preserve schemas, keys, operation checkpoints, volumes and reservations. Existing SQL service can continue. Do not remove CNPG CRDs, namespaces, finalizers, PVs, helper journals or admission boundaries while any installation is held. Do not roll the App helper back over newer deployed router changes. Returning a catalog to disabled does not cancel accepted customer orders.

## Monitoring and remaining launch evidence

UI shows observation time, measured logical size, dedicated filesystem use, warning thresholds and unknown/stale state. Missing observations cannot start billing. A shared logical allowance is measured, not a hard per-customer filesystem cap. Review pool growth and connection demand; a full Shared filesystem affects all occupants.

Local evidence covers SQL/role isolation, direct/pooler TLS, pg/Prisma clients, ENOSPC/fail-closed storage, lifecycle and migration. Production DNS/firewall/TLS, multi-node deployment compatibility, real external client paths, sustained load and 24-hour observation remain launch checks. External alert delivery is not proven.

## TODO: backups

- Select an existing external EU S3 provider, bucket and region through operator configuration; never paste keys into chat.
- Verify Barman/plugin/sidecar provenance and compatibility; reserve backup/restore resources.
- Configure encrypted credentials, base backups, WAL archive and retention.
- Prove independent restore, PITR, cross-customer isolation, RPO/RTO and alert delivery.
- Only then expose backup-dependent actions and recovery-window terms in new tariff revisions.

## Qualification observation

`infra/postgres/observe_pilot.py` is restricted to the disposable local container. It records installation UID, ready primary and restart count every five minutes, and emits a completed record only after elapsed wall time. The current 24-hour run started 2026-10-12T19:15:42Z; initial two installations were Ready with zero restarts. Logs remain in the ignored local progress directory until reviewed; this is availability sampling, not a continuous performance or failover test.

The installed BetterAuth limiter counts until an idle window; continuously polling multiple Studio views can exhaust its shared introspection bucket. The new DB view uses a 75-second interval. Review the broader authentication rate policy before multi-user production qualification; do not weaken authentication or treat an HTTP429 as success.

For the outstanding external Vercel client qualification, installation of the currently absent CLI is recommended (`npm i -g vercel`) to inspect deployments, logs and environment bindings. No Vercel deployment was performed by these local tests.

## First production instance: Webdock

Tenant `103216044377636864`, project `103216298636345344`, database `103217546714419200`, installation `103217546630533120`, on `wd-eu-02`. PostgreSQL has 1 GiB RAM, 500m CPU and a 10 GiB bounded filesystem; the separate pool is 32 GiB. The operator accepted the Starter catalog terms (14.90 EUR net/month, manual invoice handling). No public tariff release or external provider purchase occurred.

Prepared empty schemas: `webdock_auth` (Auth), `webdock_admin` (customer/registry), `webdock` (CMS), `webdock_mail` (Mail). The customer migration role owns them; the application role receives usage and default DML grants. These are destinations for a separately planned migration, not proof that the services already use this database. Existing `app` remains the default connection schema; clients using the prepared schemas must choose their schema explicitly.

Endpoint `db-103217546630533120.pg.webdock.dev`, direct TCP32000, pooler TCP32001. TLS uses the cluster's dedicated private CA; obtain its certificate and credentials from protected Studio. Only these two ports were added to the existing node02 guard; member-port and other-node rules remain unchanged. Use a client-side query timeout or transaction-local SQL timeout with PgBouncer; it rejects the `statement_timeout` startup parameter.

The production App router/helper were preserved by hash. PostgreSQL's helper is isolated in `/opt/webdock-postgres-storage` with `/etc/webdock-postgres-storage.json`. Agent daemon adds the database stage; the deployed observer adds only PostgreSQL capability; the existing routed storage client adds an optional socket argument without replacing its router. Original files and applied manifests are root-only under `/root/webdock-postgres-20261012` on node02. A future full agent rollout must preserve/reconcile this deployed baseline.

Both production app deployments report READY at merge `6b3e76e`. Direct and pooled Node pg logins succeeded for both roles, all four schemas were visible, and incorrect password/hostname tests failed as required. PostgreSQL and PgBouncer have zero restarts at verification; the existing App pod remains Ready with zero restarts. This initial check is not a 24-hour/HA/SLA qualification. No backups or existing-data migration were enabled.
