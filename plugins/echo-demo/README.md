# Echo demo extension

Minimal reference plugin for the generic Webdock plugin runtime: no capabilities, host services or external providers. It exposes `demo.echo` and a `project.overview.panel` (`demo.panel`) that echo a message within the signed project. The runtime refuses any manifest except the reviewed `manifest.json` contract (apart from the pinned image digest).

The root `Tiltfile` builds its image (`Dockerfile`, from the repository root), pushes it to the local registry and seeds it as an installed release. The local process uses private Unix sockets for its listener and the Core callback; use the generic chart and mutual TLS for remote runtimes.

```sh
cargo test --manifest-path plugins/echo-demo/Cargo.toml --locked
cargo clippy --manifest-path plugins/echo-demo/Cargo.toml --locked --all-targets -- -D warnings
```
