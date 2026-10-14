# Native API production rollout — 2026-10-14

The native API, protected UI proxy, private cache and billing worker run in the existing k3s cluster at `178.104.141.95`, namespace `webdock-platform`. Auth and Studio DNS now point to that ingress. Repository integration and the final Vercel promotion are recorded below when complete.

## Verified production behavior

- All 20 additive PostgreSQL migrations and final RLS policies are installed. Strict runtime readiness passes using verified TLS, PgBouncer and separate restricted principals. The temporary offline login has no password, login, CREATEROLE or memberships; its HBA entry is removed. Migration journal ownership belongs to the NOLOGIN platform owner.
- `https://api.webdock.dev/healthz` and `/readyz` return 200 with valid TLS. All four workloads are ready. API/worker use a read-only non-root runtime, bounded resources and no Kubernetes service-account token. Cache has no public port and accepts application traffic only from API pods.
- Auth returns 200; Studio performs the native OIDC flow. The owner completed real login/MFA in the shared browser; Studio recognizes the existing platform operator and displays existing projects. The Vercel integration reads the existing authorized projects successfully.
- The issuer remains `https://auth.webdock.dev/api/auth`. Canonical Server Actions requests pass origin checking (404 for a deliberately nonexistent action); a foreign origin fails with `E80`. Unauthenticated MCP requests return 401.
- The existing Vercel integration secret was recovered through its authenticated console. Its existing encrypted installation token was recovered and verified against the same team/configuration, including deployment write scope. The GitHub App key was verified against `/app`; the database-gateway key was recovered from its existing Kubernetes Secret. Existing Auth/SSO/Mail encryption roots were retained.
- The lost GitHub webhook secret was replaced only after the matching API receiver was ready and DNS switched. GitHub's native redelivery of an already-recorded event returned 202 with `duplicate: true`; its public receiver URL and TLS verification remain unchanged.
- Integration credentials are saved in 1Password, Marketplace vault, **Webdock API production integrations**. No credential values are committed.

## Artifacts and routing

API/worker image index: `sha256:5d4670670d1c6ceda9b79198372b7be22c45b7dac1dc7049821716313acf8429`, built from runtime source at `d6017aa`; later changes up to the initial rollout affect installer/docs/infrastructure only. The image was imported into the target containerd store under its immutable digest.

Initial production UI candidates, deployed without moving Vercel aliases:

- Auth: `dpl_DxuayuSjrSa13GaqTSwVuieXxcZE`
- Studio: `dpl_DUFxRpNoycL4wbHDR9zVMU7YZLmZ`

The cluster forbids ExternalName Services. The deployed solution keeps that policy intact: Traefik sends UI traffic to an internal ClusterIP NGINX proxy, which uses verified TLS and separate protected-deployment credentials to reach fixed immutable Vercel origins. Protocol/API paths go directly to Bun. Requests asking Vercel to issue bypass cookies are excluded from UI routing. Query/header access logging is disabled. The temporarily enabled ExternalName provider option was reverted and unused credential-bearing middleware removed.

Auth/Studio certificates were issued with DNS validation before changing their A records; temporary validation records were removed. The certificate was added to the existing Traefik ACME store with an atomic write and a private backup, preserving every existing certificate and account. Traefik loaded it on a successful rolling restart. Its existing HTTP-01 resolver owns subsequent renewal after the DNS switch. Certificate contents/private keys are not in Git.

## Operational boundaries

The billing worker handles explicitly selected live and sandbox environments; an empty catalog performs no provider call. Live Polar credentials, products, prices and payments were not created. Storage scheduling must transfer only after the old Vercel cron definitions are removed. Previously disabled native Mail workers remain disabled.

Existing Vercel artifacts remain available for compatibility rollback. Do not restore an older database over new records. Runtime secret cleanup from the old Vercel projects follows verified final promotion; the new UI code uses only the HTTP API. The exact pre-cutover state and private operational evidence remain in the ignored deployment directory.
