# Managed PostgreSQL viewer — 14 October 2026

Managed databases previously appeared only in hosting inventory. The separate
database browser listed manual bindings and grants, so a tenant with a managed
database could see an empty browser directory.

Both tenant database pages now include managed databases. Ready databases offer
**Open in Tabularis**, also available in the database overview and sidebar. The
viewer uses the existing Tabularis workspace and has no manual binding or grant
setup. Existing registered PostgreSQL/SQLite viewers keep their grant model.

## Access and lifecycle

The API uses the same live tenant-administrator permission required to display
managed database credentials. Operator MFA, current membership, native session,
preview restrictions, database readiness, backend identity and credential/database
revisions are checked. Single-use launch codes expire after 60 seconds; sessions
expire after 15 minutes. Migration, pause/resume, credential rotation or removed
authorization cannot retarget or revive an old session.

Credentials remain between the API and gateway. Each managed session starts a
separate Tabularis process with a private temporary directory, one saved connection,
its own proxy secret, and PostgreSQL `verify-full` TLS. Processes share the gateway
container UID; this is application-level isolation, not separate kernel sandboxes.
Expiry, logout and revocation terminate the process and remove its files. Saved SQL
and notebooks are temporary; the viewer explicitly explains this limitation.

## Verification

- Console: 51 tests, TypeScript, focused lint and production build passed.
- Database contracts: 5 tests passed.
- Gateway: 15 deterministic tests passed; existing opt-in runtime tests remain
  separately gated. The new real managed-runtime test passed with the pinned
  production image, nonroot UID, read-only root, dropped capabilities and tmpfs.
  It exercised schema/data edits in a disposable PostgreSQL fixture, verified TLS,
  rejected an unrelated CA/connection target, and checked process/file cleanup.
- Kubernetes renderer: 8 tests passed. Prebuilt-artifact preparation: 2 tests passed.
- API: TypeScript, managed/legacy integration and strict PostgreSQL RLS tests passed.
- Independent review found no security/correctness blocker.

The live administrative verifier used an existing MFA-enabled operator session,
without reading session tokens or creating an authentication session. For tenant
`101988493768523776`, it found one ready managed database, launched the public
gateway, negotiated actual Tabularis v1, listed one schema and zero tables, and
verified `current_database()`/`current_user()` against the assigned database and
migration role. Logout succeeded; subsequent access returned 401. No customer
content rows were read or data writes attempted. This verifies the administrative
service-to-gateway-to-database path, not a new browser/OIDC login ceremony.

## Production rollout

Migration `0022_managed_database_viewer.sql` and matching RLS policies were applied
after a private platform-schema/policy/journal backup. The context-signing key was
preserved. Both new tables force RLS; session runtime roles cannot fabricate
managed sessions or rewrite launches. The temporary offline migrator was disabled,
its password/privileges/memberships removed, and its temporary HBA entry removed.
Migration completed without stopping the API or worker.

- API image: `sha256:d06903d4ebcea31013bc4d9aee6be34abbcc3580b0ee56b5a08d25152f2e789a`.
- Gateway image: `sha256:8e4c4adaf5a32e1736c09e54ea98c86779cc6ec7cd16821d4bbabd8b6d1330ce`.
- Console artifact: `webdock-admin-oq3fpnr72-spitzli.vercel.app`.

Images and Console code were built locally. The Vercel artifact used `--prebuilt`;
actual Function region `fra1` was verified. Vercel artifact packaging/control-plane
services remain global. The API release overlays only the five changed runtime
files on the verified previous image. The worker and existing database runtimes
were not replaced. Digest aliases must exist in containerd before deploying with
`imagePullPolicy: Never`; the API restart briefly waited for that alias.

The Console prebuilt adapter omitted its real root page when a parallel toolbar
slot shared `/`. Artifact preparation now restores that page and its traced files;
the corrected immutable deployment redirects unauthenticated root requests normally.

Two existing network gaps were repaired:

1. Gateway HTTPS calls to Auth now allow only the matching Traefik pods on TCP
   8443 after service DNAT. TLS, the Auth protocol hostname and gateway secret stay
   unchanged. The renderer includes this rule.
2. The database node's persistent `webdock_cluster_guard` firewall previously
   admitted only the first backend's public ports. One rule now admits managed
   ports 32000–32199 **only from the gateway address**. All other active/persistent
   rules remain identical. Gateway connections to both backends succeed; the
   previously blocked port remains blocked from other sources. Database pods were
   not restarted.

Gateway capacity is four simultaneous managed processes with bounded memory and
tmpfs. The four existing registered runtimes remain ready. Private deployment,
firewall, policy and UI-proxy snapshots are retained outside Git for rollback.
Rollback restores the previous images/proxy target and keeps the additive tables;
never restore an old database snapshot over later user records.
