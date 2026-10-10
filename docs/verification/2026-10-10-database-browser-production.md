# Database browser production activation — 2026-10-10

The owner authorized activation for Lunares, Webdock and Spitzli, including the operator and existing customer accounts with full access to their own databases.

## Infrastructure

- Existing Contabo k3s node `vmd208517`, dedicated `webdock-databases` namespace.
- Public gateway: `https://database.webdock.dev`, Vercel DNS A record, Traefik/Let's Encrypt certificate. `/healthz` returns HTTP 200.
- Four isolated Tabularis runtimes: Webdock/operator, Spitzli/operator, Lunares/operator, Lunares/existing customer Elias. No additional customer memberships exist for Webdock or Spitzli at activation.
- Runtime source pin: `fdd6c0a6f979ede0acb38415fa12b25c04aa9c4e` (same embedded package source). Authenticated runtime negotiation confirmed that exact commit for all four runtimes.
- Gateway OCI index: `sha256:cfa23d205d3b539e18c69cc2c4827d987632ffca981c24d0b4d7930b05003853`.
- Tabularis OCI index: `sha256:2428b239ec2f067743f0f4dee678bda8f32f420786df6b49d385819d95c9114d`.
- TLS sidecar OCI index: `sha256:700ded80c793d3e7cb7631ec59b1650c605ffbc4b2d12d14a0def9eb693dfa2c`.

Images were built locally, imported into k3s and run with imagePullPolicy Never. Workloads have non-root UID/GID 65532, read-only root filesystems, no service-account tokens, all capabilities dropped, resource bounds and startup/readiness/liveness probes. The namespace has its own quota and default-deny network policy; only Traefik can enter the public gateway, and only the gateway can enter the runtime TLS services. PostgreSQL runtime egress is limited to DNS and public TCP 5432. The gateway has DNS, public HTTPS to Auth, and runtime TLS access. Internal TLS uses a dedicated CA trusted by the gateway.

Caddy's stock image file capability initially conflicted with capability dropping. The owned TLS image removes that file capability; no cluster admission rule was weakened. The namespace readiness label was set after quotas, network policies and Restricted Pod Security were installed.

## Database boundaries

The existing `webdock_runtime` and `spitzli_runtime` logins own their respective schemas. Live checks verified no superuser, CREATEDB, CREATEROLE or BYPASSRLS, and no USAGE/CREATE access to the other project, Auth, Studio or public schemas. The explicit full-schema browser grants use those project-scoped credentials only inside isolated runtimes.

Lunares uses the existing SQLite file. A retained local-PV alias references the existing quota-backed directory on the same node; it does not copy, replace or enlarge the bot database. The original bot and browser pods use UID/GID/fsGroup 65532. The directory is 65532:65532 mode 2770, and the database is 65532:65532 mode 0660. Existing customer quotas and the bot deployment are unchanged. Revoke browser grants and stop both consumers before decommissioning that volume.

Both the initial schema migration and the additive `database_binding.engine` migration were applied as `webdock_auth_runtime`. SQLite registration remains an explicit operator action; PostgreSQL is the backward-compatible default.

## Verification

- Studio/Auth production builds, typechecks and focused Studio lint passed for the SQLite update.
- Database contracts: 4 tests passed. Gateway: 7 deterministic tests passed, including stored SQLite connection parameters replacing a forged path. Existing real PostgreSQL authorization and runtime tests passed before activation.
- Independent review found no engine/deployment merge blocker; it requested ownership compatibility and actual authenticated runtime checks, both completed.
- All four runtime connections authenticated over internal TLS with the expected build pin and executed real metadata queries: Webdock 14 tables, Spitzli 23, both Lunares runtimes 26.
- No customer content rows were changed by these checks.

## Operations

Private deployment inventory, generated certificates and verification tooling are retained outside Git in the operator's private cache. Kubernetes Secrets hold per-runtime database/proxy credentials; Auth stores encrypted proxy credentials. Leaf certificates are valid for 365 days and need renewal before expiry. The single-node image imports and local volumes require explicit restoration/reprovisioning if the node is replaced. Runtime state PVC size requests do not constitute independently enforced hard byte quotas on local-path storage; the existing Lunares database backing volume retains its fixed filesystem quota.

The new gateway Auth secret/origin are configured only in the Auth production project. Studio/Auth redeployment and the final public gateway authorization check are recorded below after rollout completion.
