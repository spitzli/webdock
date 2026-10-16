# Webdock plugin registry project

The owner requested a project for the registry on 2026-10-16. It was created through the authenticated Console in the **Webdock** workspace, separately from **Webdock Plattform**.

- Workspace: `103216044377636864` (Webdock).
- Project: `104618288083894272` (Webdock Plugin Registry).
- Console: <https://console.webdock.dev/hosting/projects/104618288083894272/overview>.
- Source repository recorded: <https://github.com/TabularisDB/tabularium>.

The registry is deployed at **https://registry.webdock.dev** on Webdock Cluster EU (`102835722657992704`). Tabularium 0.25.0 is initialized with PostgreSQL, a persistent data volume, a generated Ed25519 registry signing key and a verified bootstrap admin login. This is a plugin metadata registry, not an OCI image store. Webdock plugin publication and the signed install round-trip remain separate work.

Use separate deployment configuration and registry credentials for this project. Keep the plugin runtime installer independent of its registry being online: installed verified release bytes and image identities remain in Webdock. The registry kind/schema and signed release round-trip still require the runtime plan's Core Task 5 verification.

## PostgreSQL — provisioned 2026-10-16

The owner selected the existing PostgreSQL server with a separate logical database and user. No extra server or paid database order was created.

- Existing installation: `103217546630533120` on `wd-eu-02`, namespace `wd-db-103217546630533120`.
- Existing Main database remains `db_103217546714419200`.
- Registry database and login: `webdock_plugin_registry`.
- Host: `db-103217546630533120.pg.webdock.dev`; direct port `32000`, existing transaction pooler port `32001`.
- TLS certificate and hostname verification are mandatory; use the existing private CA.
- Credentials/CA are in Kubernetes Secret `webdock-plugin-registry-db` in that database namespace. Private operator copies are under `/home/newt/.cache/webdock-plugin-registry/` with mode-0600 credential files. Do not put passwords in project notes, Git or deployment logs.
- The login owns only the registry database, has no superuser/create-database/create-role/replication/bypass-RLS privileges or role memberships, and is limited to 10 connections. PUBLIC database/schema access is revoked.

Direct and pooled TLS logins, transactional table creation/read/write/rollback, invalid-password rejection and denied Main-database login were verified. Main schema/catalog fingerprint and database ACL are unchanged. PostgreSQL and PgBouncer remained on their original pods with zero container restarts. See `docs/verification/2026-10-16-plugin-registry-database.json`.

The database is an operator-managed auxiliary database, not a separate customer Managed PostgreSQL order; the Console's order list therefore does not show a new purchased database. Its project notes record the association. The registry application uses its own encrypted environment value for the internal PostgreSQL URL with `sslmode=verify-full`. The public database CA is stored at `/data/postgres-ca.crt` and loaded with `NODE_EXTRA_CA_CERTS`. Tabularium migrations ran through its authenticated installation API.

## Preserve during agent maintenance

The root-owned `/etc/webdock-postgres.json` has this additive configuration:

```json
{"platformAuxiliaryDatabases":{"103217546714419200":[{"name":"webdock_plugin_registry","roles":["webdock_plugin_registry"],"projectID":"104618288083894272"}]}}
```

The agent generates an exact TLS-only HBA rule and project-specific ingress for this database, retains the Main rule, and refuses ordinary parent maintenance/purge/migration while auxiliary databases require reviewed offline maintenance. Removing configuration is not a data deletion or migration workflow. Registry and Main share the instance's capacity and maintenance lifecycle.

Only the auxiliary support was overlaid onto the deployed `console-setup-a0a0876/databases.py`; unrelated live code was preserved. The agent was restarted after confirming no live cluster operations. Original module/config backups are under `/root/webdock-plugin-registry-20261016` on node02. Preserve this addition on later agent rollouts; the repository contains the matching implementation and tests. The existing live `webdock_registry_runtime` HBA permission was also retained in the configuration rather than being lost on reconciliation.

PostgreSQL role/database commands follow the [PostgreSQL 18 role](https://www.postgresql.org/docs/18/sql-createrole.html) and [database](https://www.postgresql.org/docs/18/sql-createdatabase.html) contracts. The database verification file records the earlier database-only checkpoint. The subsequent application rollout is recorded in `docs/verification/2026-10-16-plugin-registry-runtime.json`.

## Application — deployed 2026-10-16

- Application: `104651089088876544`; setup: `104648662839201792`.
- Console: <https://console.webdock.dev/hosting/apps/104651089088876544>.
- Namespace: `wd-104618288083894272`; Deployment/Service: `app-104651089088876544`.
- Image: `ghcr.io/tabularisdb/tabularium@sha256:3384ebd98e74f704b31653d921ad872f94936e29ad3fef6c0281519ad9304cf3`, version 0.25.0, source revision `5d1818352f7e4a018f6ace31a7f185d5a6b6f292`.
- One replica, 500m CPU, 512 MiB RAM, 256 MiB ephemeral storage, 1 GiB retained `/data` volume. Runs as UID 65532 with read-only root.
- Operator custom plan `Webdock intern – Registry` supplies this allocation; no additional paid service order was placed. Existing database billing remains separate.
- Normal readiness/liveness path: `/healthz`. Initial provisioning used `/api/init/status` until database initialization completed.
- DNS: Vercel team `spitzli`, `registry.webdock.dev A 79.143.177.157`, record `rec_6e6404f3bc8cb9b007c4e1ea`.
- Namespace-scoped Let's Encrypt issuer `webdock-acme`, certificate/Secret `registry-tls`. HTTP redirects to HTTPS; ACME uses its own longer challenge path.
- Operator networking/certificate manifests: `infra/registry/runtime-infrastructure.json`. Preserve these separately managed objects during hosting-agent maintenance. They allow only the registry app to reach the existing PostgreSQL pods on 5432; the database ingress/HBA separately allows the registry project and login.
- JWT, token-encryption and bootstrap secrets are encrypted in Webdock application configuration. Preserve them and `/data/config.json` during redeploys. Do not reinitialize a populated database or rotate keys without a migration plan.
- Initial admin: `admin@example.com`; sign in at <https://registry.webdock.dev/login/admin>, then open `/admin`. The password is in the operator-only local file `/home/newt/.cache/webdock-plugin-registry/registry-admin-access.txt` (0600); it is not committed. The normal login was verified after installation and restart. Tabularium disables this recovery login when the admin links an OAuth identity.
- Signing-key ID: `5d8025c66487bb44`; public endpoint `/.well-known/registry-key.json`. This key has not yet been enrolled in the Webdock plugin trust configuration.

The application is an initialized, empty Tabularium registry. Provider/OAuth configuration, Webdock-specific plugin kind/schema, publishing and installation verification are still outstanding; a successful registry deployment does not establish those capabilities.

## Requested follow-up

After the registry, deploy Plausible at `moon.webdock.dev` for the Webdock start page. Then offer managed tracking as a mini addon with an optional custom tracking domain. Owner requested this sequence on 2026-10-16; Plausible has not been provisioned by this registry rollout.
