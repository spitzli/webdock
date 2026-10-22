# Hosting plugin

Apps as a Webdock plugin. A project runs an app from a container image with a port, a memory size (128 MB to 2 GB) and environment variables. Customers can redeploy with a new image, edit variables (stored AES-256-GCM sealed; only names are ever shown), start, stop and restart, read the last 200 log lines, and delete the app. Features: `create-apps` (create and delete) and `resize-apps` (memory), each with its own access mode.

Placement in local dev: one Docker container per app, its port published on loopback, with memory and PID limits, `no-new-privileges` and `NET_RAW` dropped. Image tags are accepted locally; `requireDigest` makes production installs accept digest-pinned images only. Production placement goes through `plugin.workloads` and the cluster agent, and replaces `src/placement.rs`; domains, TLS, builds from Git and volumes come with it.

```sh
cargo test --manifest-path plugins/hosting/Cargo.toml
# Disposable loopback PostgreSQL for plugin storage, plus Docker with nginx:stable-alpine present:
WEBDOCK_HOSTING_PLUGIN_TEST_ADMIN_URL=postgres://… WEBDOCK_HOSTING_PLUGIN_TEST_DOCKER=1 \
  cargo test --manifest-path plugins/hosting/Cargo.toml -- --include-ignored
```
