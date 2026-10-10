# Persistent app storage

The user approved the file-backed filesystem approach on 2026-10-09. This increment prepares and verifies the complete feature locally before production activation. Existing Lunares data, credentials and process remain untouched.

## Storage contract

Each managed app may request one fixed-size ext4 image, mounted at `/data` through an owned static Local PV and PVC. The node agent preallocates the whole image, keeps an OS free-space reserve, and verifies filesystem UUID, backing file and mount identity. Filesystem overhead reduces usable capacity; this is a hard filesystem-size limit, not an exact usable-byte promise. No root-filesystem feature changes, repartitioning, registry pulls or remote builds.

Volumes are fixed at app creation and allow zero or one replica. Existing apps without storage remain compatible. Resizing, adding storage after creation, shared writable replicas and moving volumes between apps are outside this increment. Restart/update/rollback retain the same data. A missing or mismatched existing image fails closed and must never initialize an empty replacement. The PV points to a directory that exists only inside the mounted filesystem, so a missing mount cannot silently write into the host filesystem.

## Ownership and lifecycle

The control plane reserves bytes under its existing customer/cluster locks. Storage remains charged while stopped and after app deletion. Deleted apps with retained storage remain visible. Removing app resources retains PV/PVC and image. A distinct platform-admin command with a fresh preview hash and exact name permanently removes retained storage only after the app is deleted and no pod references its PVC. All destructive operations use the Webdock journal; no raw provider deletion is a substitute. Retry is fenced by ownership, revision and lease. Failed/uncertain operations retain reservations.

The root-owned node configuration explicitly binds the directory, node, cluster, capacity and free-space reserve. Only a single-node platform cluster advertises this capability. BYOK clusters remain unchanged. Activation requires fresh advertised storage capacity; a boolean flag alone is insufficient. Agent startup restores known filesystems before advertising storage. Missing mounts block execution.

## Access and UI

Studio, REST and MCP share existing authorization and command schemas. App forms use the existing resource field for persistent capacity and explain `/data`, fixed size, one replica and retention. English source and German gettext catalogs. Administrator-only retained-storage deletion has a separate confirmation page. No secret values or host paths are accepted from clients.

## Verification and rollout boundary

Unit tests cover invalid sizes, replica bypasses, immutable capacity, retention accounting, lost/mismatched images, foreign ownership and fail-closed mounts. Local disposable PostgreSQL integration covers authorization, reservations, stale previews and completion proof. A local disposable Kubernetes node verifies UI/API-to-agent storage lifecycle, writing to capacity, restart/remount persistence, SQLite backup/restore and separate storage deletion. Existing application security rules remain enforced.

Only after local checks pass can the storage backend be installed/activated on Contabo. No customer allowance is increased implicitly and no bot is started. EU runtime/build/storage restrictions remain; Vercel global services are not EU-only.
