# Native plugin host

This crate is the trusted host persistence and service boundary. It belongs in the
Control Plane/host process; plugin containers do not receive its database pools,
RLS key, or invocation signing key.

`HostService::new` verifies separate restricted `webdock_auth_runtime` and
`webdock_worker_runtime` pools. Supply a dedicated-pool `IdAllocator`, a live
`RuntimeBindings` repository, and the host Ed25519 signing key. Existing tables and
RLS helpers must be installed offline; the crate performs no runtime migrations.

The public flow is:

1. `admit` (or `admit_with_write_ceiling` for a narrower OAuth/API ceiling) checks
   the verified Principal, current project/customer authority, installation,
   runtime generation, configuration, approved capabilities, grant and manifest.
   It persists the invocation before issuing the retained signed token format.
2. `authenticate` accepts a **transport-verified** peer and token and returns an
   opaque `InvocationHandle`. Never construct peer identity from request JSON or
   an unverified header. `runtime_authority` supplies the persisted implementation
   of the runtime crate's `InvocationAuthority` contract.
3. `data_read`, `data_write`, `http_request` and guarded `apps_request` check live
   authority before executing and before releasing results/committing. SQL still
   independently checks the signed invocation scope. Handles cannot carry arbitrary
   tenant/project IDs supplied by a plugin body.
4. `revalidate` supports late-result checks, and `revoke` closes an invocation.
   Expiration/revocation also denies all subsequent service calls.

`request_state` writes desired installation state, a durable pending operation and
an audit event atomically. It retains revision CAS, idempotent command replay,
dependency blockers, and draining admission. It does not pretend that requesting a
transition completed runtime reconciliation. Grants are an admission cache: the
Core fills one per project on first use with the operator's capability ceiling and
the installation's self-service policy revision, so a policy change invalidates
in-flight invocations. New operation/audit IDs use the coordinated Rust allocator.

Documents use SeaORM entities on `plugin_document` and
`plugin_document_receipt`. Advisory locks serialize document CAS and operation
idempotency keys. Receipts and data share a transaction; write-only invocations
can replay their receipts without gaining the public read capability. Retained
v1 receipt hashing explicitly uses en-US ICU collation, ECMAScript property order
(including numeric object keys), and `ryu-js` number formatting. Node-generated
fixtures cover Unicode, mixed case, escaping, numeric keys and floating values.
The fixture environment reported `en-US`, variant sensitivity, default collation,
non-numeric ordering and default case order. A deployment with a different legacy
Node collation requires an explicit compatibility decision before migration.

Outbound HTTP uses operator-owned named per-project bindings. The broker enforces
HTTPS origins, pinned IPs, hostname-verified TLS, exact method/path and permitted
non-duplicated query keys. Proxies and redirects are disabled, request and response
bodies are bounded to 1 MiB, and exchanges have a 10-second deadline. Binding and
invocation authority are checked again after the exchange. The production path
always uses `PinnedTransport`. The `test-transport` Cargo feature exposes a clearly
named test-only entry point; it is unnecessary in production builds.

`FileBindings` reloads an operator-owned JSON file on each check. Its root is
`{"runtimes": {...}}`; entries contain `generation`, `namespace`, `service`,
`credentialSha256`, `peers`, optional `publicConfiguration` keyed by project, and
optional `projects` mapping project IDs to named HTTP bindings. Unix peers specify
`{"kind":"unix","uid":42}`; mTLS peers specify a pinned leaf
`{"kind":"mutualTls","certificateSha256":"..."}`. This is the Rust transport
enrollment file, not the old HTTP runtime file containing plaintext credentials.

## Verified slice and remaining ports

Implemented: persisted action admission/authority; scoped documents and receipts;
HTTP broker; operator state commands and existing-grant mutation; fail-closed
service declarations; explicit live app adapter boundary; private Unix/mTLS
host-authority RPC; Core browser/public API and MCP admission using current
session or OAuth authority. The real PostgreSQL test exercises those routes
through an actual plugin RPC process boundary.

`webdock-plugin-controller --config /absolute/private/plugins.json` executes
persisted availability commands for already enrolled external runtimes; `--once`
processes at most one command. It uses the same explicit restricted database
configuration as the private plugin-control listener. Fifteen-second leases,
fresh claim tokens, current initiating operator authority and generation checks
fence retries. Enable requires the exact enrolled runtime manifest and peer;
health/Describe responses alone cannot grant execution.

Disable first drains admissions. Native migration 0021 keeps the installation
lock while checking durable plugin jobs, Mail jobs/leases and repository/build
continuations. Queued work and uncertain Mail handoffs remain blockers without an
arbitrary timeout. Legacy Mail jobs without a provider ID conservatively retain
the tenant's explicitly bound provider. An unavailable checker blocks completion.
Disable preserves documents, grants, runtime records and deployed processes;
runtime stop/delete and install/upgrade are separate workflows.

`GET /api/console/plugins/operations/{id}` returns a sanitized operation snapshot.
The `/events` suffix streams resumable snapshots using `Last-Event-ID`; it
coalesces intermediate state changes, revalidates current operator authority,
bounds concurrent streams/buffering and closes after 60 seconds or terminal
status. It does not expose private payloads, claim tokens or stored session proof.

Still outside this slice: source/build/install/upgrade worker lifecycle;
job leases and job invocation scopes; plugin-action gRPC `WatchOperation`;
generic built-in
module continuation/nested SQL admission; website/SSO-bound HTTP authorization;
product-specific managed-app binding/provisioning/result adapters and complete
custom-UI acceptance. Website-bound
requests, job invocations and unavailable host capabilities fail closed. No success
response stands in for an unavailable service.

## Validation

```sh
cargo test -p webdock-plugin-host
cargo clippy -p webdock-plugin-host --all-targets --all-features -- -D warnings
```

The ignored PostgreSQL integration test needs the retained local `webdock_rls_test`
fixture and these explicitly supplied environment variables:
`WEBDOCK_TEST_MIGRATION_DATABASE_URL`, `DATABASE_URL`,
`WEBDOCK_PLUGIN_WORKER_DATABASE_URL`, `AUTH_DATABASE_URL`, and
`DATABASE_RLS_SECRET`. URLs must be loopback, name that exact database, and have no
query overrides. Run all local checks with:

```sh
cargo test -p webdock-plugin-host --features test-transport -- --include-ignored
```

Tests create unique records and clean only their own records; they do not reset
schemas or shared data. Network tests use owned loopback HTTP/TLS servers and make
no provider requests. They verify pinned TLS, rejected untrusted certificates,
redirect handling, response limits, exact path/query rules, and grant revocation
during an actual HTTP exchange.
