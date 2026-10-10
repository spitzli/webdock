# Lunares runtime readiness — 2026-10-09

Status: requirements and live platform baseline inspected; environment-variable support is now live; the other runtime extensions and migration remain open. The source bot is already productive and has existing data. Do not start another instance or initialize an empty production SQLite database as a substitute for migration.

## Confirmed target and authorization

- Customer Schattenclan `101711682211938304`, project Lunares `101713101337919488`, shared Contabo cluster `101775802667896832`.
- Selfservice and custom-image permission are active. Sponsoring allows 2 apps, 1 CPU, 2 GB RAM, 2 GB ephemeral storage, one replica/app and one deployment at a time. Persistent storage allowance remains zero until an enforcing storage backend is available.
- The user explicitly permits Discord's global API and gateway as an exception to EU-only. This does not grant exceptions for Google Translate, YouTube, Twitch or arbitrary internet destinations. Platform runtime, database, builds, storage and backups remain subject to the existing EU requirement and Vercel caveats.
- Productive source host, access method, working/data paths and data size are not yet known; the user has been asked. No existing process was stopped and no data was copied or modified.

## Verified inputs

The separate Lunares checkout is `/home/newt/Projekte/Personal/NewtTheWolf/Lunares`; it contains substantial existing uncommitted work. It was inspected without modifications.

Its Dockerfile runs Python from `/data`, declares that directory as a volume, exposes port 8086 and runs as UID/GID 10001. Webdock currently enforces UID/GID 65532. Writable data ownership and the image must agree without enabling root, host paths, extra capabilities or a writable root filesystem.

Multiple Lunares modules use relative `lunares.db`; logs/transcripts and other working-directory files also require inventory. Migrating only the API PostgreSQL tables would lose existing bot business data. Frankfurt PostgreSQL is already provisioned for API/setup state, not a completed SQLite business-data migration.

Lunares has `/healthz` for process liveness. Authenticated `/v1/status` reports Discord readiness. The same HTTP path for all Kubernetes probes is insufficient: Discord outages must not cause unnecessary process restarts. A minimal readiness endpoint needs to expose only readiness, without account or server data.

Contabo was inspected read-only: ext4 root filesystem, about 190 GB free, local-path as the only StorageClass, no PVs, no ingress objects, no customer pods. k3s Secrets encryption is enabled and server encryption hashes match. The Webdock agent is active.

## Required platform work

1. **Configuration and secrets:** project/app-scoped environment management via Studio/API/MCP; encrypted secret values at rest; write-only values in the UI; no plaintext secrets in app specs, operation history, diagnostics or logs. Agent claims receive only the secrets needed for the leased app revision. Rotation, rollback, deletion and redaction require tests, not just `envFrom` insertion.
2. **Durable data:** a storage backend that actually enforces allocated bytes, with an explicit data-retention lifecycle and restore check. Plain local-path requests are not an enforcing quota. Preserve data across app stop/recreate/delete; do not silently destroy a PVC when deleting an app. Choose size after source inventory, then update the sponsoring allocation explicitly.
3. **Outbound access:** operator-approved Discord API/gateway and the exact Frankfurt PostgreSQL destination. Keep API/node/metadata/private-network isolation. Kubernetes' current NetworkPolicy model is IP/port based; dynamic DNS names and shared CDN addresses require a deliberate egress design, not a blanket `0.0.0.0/0` exception. Review optional Lunares external modules separately.
4. **Image delivery:** local/EU build, secret-free build context, immutable digest, and controlled delivery to the node. Keep the current cached-only policy until the controlled delivery path exists. Do not start unverified remote builds.
5. **Ingress and health:** verified customer-owned HTTPS host for the signed Bot API, valid TLS, limited service route, no sensitive-header/body logging, separate liveness/readiness/startup behavior. The existing Vercel panel must reach this endpoint for its connection test.

## Cutover acceptance

First inventory the running source and all data paths. Produce and restore-test a consistent backup, including SQLite WAL state and sidecar files where applicable. Build and validate the runtime without a live Discord token. Schedule a short cutover: stop the old instance, take a final consistent copy, restore target data and ownership, start exactly one target instance, verify PostgreSQL, Discord readiness and the signed panel connection. Keep the old installation and backups intact for rollback. Do not invent or replace Discord/API credentials; use the intended private configuration and preserve rotations.

No production runtime changes were made during this assessment. The user explicitly deferred source-host details until runtime preparation is finished. They are required for the later cutover, not a blocker for independent platform work.

References: [Network policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/), [Persistent volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/).

### Environment milestone completed

App environment editing, encrypted storage, versioned Secret injection and rollback are live in Studio/Auth/Contabo. See `2026-10-09-app-environment.json` under `docs/verification`. No Lunares secrets were imported, no customer app was created and the existing bot was not touched.
