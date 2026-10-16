# Webdock plugin registry project

The owner requested a project for the registry on 2026-10-16. It was created through the authenticated Console in the **Webdock** workspace, separately from **Webdock Plattform**.

- Workspace: `103216044377636864` (Webdock).
- Project: `104618288083894272` (Webdock Plugin Registry).
- Console: <https://console.webdock.dev/hosting/projects/104618288083894272/overview>.
- Source repository recorded: <https://github.com/TabularisDB/tabularium>.

The saved project was read back in the Console. No application hosting is assigned and no registry application is deployed yet. An auxiliary logical database was provisioned on the existing PostgreSQL installation as described below. No domain, registry signing key, trust root or registry deployment has been configured. The project is the organizational destination for the future Tabularium registry, not evidence of a working registry or OCI image store.

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

The database is an operator-managed auxiliary database, not a separate customer Managed PostgreSQL order; the Console's order list therefore does not show a new purchased database. Its project notes record the association. Application binding/mounting of the credential Secret and registry migrations belong to the later Tabularium deployment.

## Preserve during agent maintenance

The root-owned `/etc/webdock-postgres.json` has this additive configuration:

```json
{"platformAuxiliaryDatabases":{"103217546714419200":[{"name":"webdock_plugin_registry","roles":["webdock_plugin_registry"],"projectID":"104618288083894272"}]}}
```

The agent generates an exact TLS-only HBA rule and project-specific ingress for this database, retains the Main rule, and refuses ordinary parent maintenance/purge/migration while auxiliary databases require reviewed offline maintenance. Removing configuration is not a data deletion or migration workflow. Registry and Main share the instance's capacity and maintenance lifecycle.

Only the auxiliary support was overlaid onto the deployed `console-setup-a0a0876/databases.py`; unrelated live code was preserved. The agent was restarted after confirming no live cluster operations. Original module/config backups are under `/root/webdock-plugin-registry-20261016` on node02. Preserve this addition on later agent rollouts; the repository contains the matching implementation and tests. The existing live `webdock_registry_runtime` HBA permission was also retained in the configuration rather than being lost on reconciliation.

PostgreSQL role/database commands follow the [PostgreSQL 18 role](https://www.postgresql.org/docs/18/sql-createrole.html) and [database](https://www.postgresql.org/docs/18/sql-createdatabase.html) contracts. No Tabularium schema migration, registry publishing, DNS change or plugin-platform rollout was performed here.
