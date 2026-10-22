# Hosting plugin

Apps as a Webdock plugin. A project runs an app from a container image with a port, a memory size (128 MB to 2 GB) and environment variables. Customers can redeploy with a new image, edit variables (stored AES-256-GCM sealed; only names are ever shown), start, stop and restart, read the recent log lines (the last 100, up to 24 KiB), and delete the app. Features: `create-apps` (create and delete) and `resize-apps` (memory), each with its own access mode.

Placement goes through `plugin.workloads`: each app is one unit of a Secret (its environment), a Deployment, a Service and a Traefik route on `<name>-<id>.<domain>`. Core pins the unit to the project's namespace and the cluster's agent applies it and reports readiness, pod problems and recent logs, which `apps.view` and `apps.logs` read back. Stop scales to zero, restart rolls the pods. Locally the apps run on the dev k3s and answer on `http://<name>-<id>.apps.localhost:55480`. Image tags are accepted locally; `requireDigest` makes production installs accept digest-pinned images only. Domains with TLS, builds from Git and volumes come later.

```sh
cargo test --manifest-path plugins/hosting/Cargo.toml
# Disposable loopback PostgreSQL for plugin storage; Core and the cluster are stood in for:
WEBDOCK_HOSTING_PLUGIN_TEST_ADMIN_URL=postgres://… \
  cargo test --manifest-path plugins/hosting/Cargo.toml -- --include-ignored
```
