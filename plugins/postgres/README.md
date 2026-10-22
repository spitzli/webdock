# PostgreSQL plugin

Managed PostgreSQL as a Webdock plugin, with two offerings:

- **Shared database:** a login role and a database on a shared server from the private configuration. The role gets `CONNECT` and `TEMPORARY` on its own database only; `PUBLIC` loses `CONNECT` on every database, including `postgres` and `template1`.
- **Dedicated instance:** a PostgreSQL server of its own. In local dev the plugin runs it as a Docker container with a volume, published on loopback. Production placement goes through `plugin.workloads` and the cluster agent (CNPG) and replaces `src/dedicated.rs`.

State lives in the plugin's own database (`storageUrl`); migrations run at startup under an advisory lock. Passwords are generated (hex), stored AES-256-GCM sealed with `secretKeyHex` and bound to the resource id, and are returned only by `databases.credentials`. Every resource action re-checks that the resource belongs to the invoking project. Database URLs must be loopback until TLS is configured.

The React UI in `ui/` is bundled by the Console and shown on the resource page.

```sh
cargo test --manifest-path plugins/postgres/Cargo.toml                    # manifest contract
# Real PostgreSQL (disposable, loopback) and, for dedicated instances, Docker:
WEBDOCK_POSTGRES_PLUGIN_TEST_ADMIN_URL=postgres://… WEBDOCK_POSTGRES_PLUGIN_TEST_DOCKER=1 \
  cargo test --manifest-path plugins/postgres/Cargo.toml -- --include-ignored
```
