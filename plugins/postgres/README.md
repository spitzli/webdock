# PostgreSQL plugin

Managed PostgreSQL as a Webdock plugin, with two offerings:

- **Shared database:** a login role and a database on a shared server from the private configuration. The role gets `CONNECT` and `TEMPORARY` on its own database only; `PUBLIC` loses `CONNECT` on every database, including `postgres` and `template1`.
- **Dedicated instance:** a PostgreSQL server of its own, placed through `plugin.workloads`: a CloudNativePG cluster with the customer role's password in a Secret the operator reconciles (rotation is a new apply), and a Traefik TCP route that passes TLS through by server name (`pg-<id>.<domain>`, `sslmode=require`). Locally it runs on the dev k3s and answers on port 55442.

State lives in the plugin's own database (`storageUrl`); migrations run at startup under an advisory lock. Passwords are generated (hex), stored AES-256-GCM sealed with `secretKeyHex` and bound to the resource id, and are returned only by `databases.credentials`. Every resource action re-checks that the resource belongs to the invoking project. Database URLs must be loopback until TLS is configured.

The React UI in `ui/` is bundled by the Console and shown on the resource page.

```sh
cargo test --manifest-path plugins/postgres/Cargo.toml                    # manifest contract
# Real PostgreSQL (disposable, loopback); Core and the cluster are stood in for:
WEBDOCK_POSTGRES_PLUGIN_TEST_ADMIN_URL=postgres://… \
  cargo test --manifest-path plugins/postgres/Cargo.toml -- --include-ignored
```
