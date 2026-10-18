# Approved CMS instances

This adapter uses the existing managed application and database cluster. It does
not create hosts or accept images, commands, hostnames, database plans or secrets
from plugin input. A same-cluster managed PostgreSQL service binding is required.

## Operator configuration

After publishing the reviewed CMS image, set `WEBDOCK_APPROVED_CMS_TEMPLATE` on the
full control-plane API and setup worker to this JSON structure:

```json
{
  "image": "ghcr.io/OWNER/CMS@sha256:EXACT_DIGEST",
  "domain": "cms.example.com",
  "addresses": ["PUBLIC_INGRESS_IP"],
  "certificateIssuer": "webdock-cms-acme",
  "ingressClass": "traefik",
  "planRevisionID": "EXISTING_DATABASE_PLAN_REVISION",
  "authIssuer": "https://auth.example.com/api/auth",
  "authAddresses": ["AUTH_HTTPS_IP"]
}
```

Use the same object under a `managed-cms` key in root-owned, non-writable-by-others
`/etc/webdock/app-templates.json` on the managed agent. Install `app_templates.py`
with the existing agent modules and restart the agent using the existing service.
Only the daemon supports the approved template polling lane; the older SSH bridge
does not advertise or process it. The image must already be public/pullable or
have an operator-installed pull configuration suitable for this cluster.

The `certificateIssuer` must be an operator-installed HTTP-01 `ClusterIssuer`,
using Traefik and a ClusterIP solver Service. Each instance gets its own exact
hostname `Certificate`, `Ingress` and TLS Secret. Set the issuer solver Pod label
`security.webdock.dev/ingress=true`, requests CPU `25m`, memory `32Mi`, ephemeral
storage `8Mi`, and limits CPU `200m`, memory `64Mi`, ephemeral storage `64Mi`.
The installed cert-manager v1.21.2 solver uses `OnFailure`, no API token, a read-only
root and no extra capabilities. Existing application admission requires three
probes only for `Always` Pods; no global policy exception is needed.

Only namespaces with an exact operator-approved owned CMS Certificate receive the
fixed solver overhead and one additional Service slot. Ordinary executor quota
updates preserve this allowance, allowing cert-manager renewal while the plugin
is disabled. The agent never copies or writes certificate key material. It refuses
a foreign Certificate, a replaced recorded UID, or an unowned TLS Secret, and
waits for Certificate Ready and pinned HTTPS instance health before publishing.
The normal executor retains only the exact owned `app-ID-tls` Secret bearing the
matching cert-manager Certificate annotation.

Wildcard DNS `*.cms.example.com` must point to exactly the approved ingress IPs;
HTTP-01 issues each concrete hostname and needs no DNS provider credential in the
cluster. Certificate/Ingress UIDs are recorded durably. Certificates stay in place
on plugin disable so cert-manager owns renewal independently of plugin grants.

The offline migration must install the provisioning schema, signed RLS helpers
and the `publish_plugin_template` function before enabling this configuration.
OAuth registration uses the existing BetterAuth provider (confidential client,
PKCE required); the client and cookie secrets are sealed and only reach the app's
runtime Secret. No provider key or database migration credential reaches plugins.
Auth requests additionally retain existing CMS billing/role restrictions.

## Initialization and recovery

The setup worker reserves capacity with the existing admission checks before
queuing the initialization. The agent creates the existing Retain RWO PVC, admits
one bounded initialization Job in the application namespace and executes only
`node /app/migrate.mjs`. The Job uses UID/GID 65532, a read-only root, `/tmp`, and
the retained `/data` volume. Default app admission remains unchanged. Its process
probes satisfy the existing container admission rules; successful Job completion,
not those probes, is the migration proof. The migration credential exists only
in the initialization Secret, which is removed after a confirmed successful Job.

Storage allocation intent is saved before the first disk allocation, independently
of the application revision advanced by service binding. A resumed allocation
can use only retained storage; missing storage requires reconciliation.
An intent is saved before Job creation. If a request is interrupted, the agent
observes the exact Job name/UID; it does not start a second migration. Missing or
failed execution evidence becomes `needs-reconciliation`. Database and media are
retained. A denied or unavailable queued operation is recorded as needing
reconciliation and skipped so other applications can progress; it receives no
execution packet. Do not delete the Job or reset intent to replay an uncertain migration.
Review the migration table and retained evidence before an operator recovery.

The normal runtime starts with DML credentials only. After it and its service
binding are healthy, publication installs the exact owned HTTPS route and Auth
egress policy, verifies TLS and the instance audience, then atomically registers
the OAuth client and website binding. A conflicting route/binding is never
adopted. Restarting uses the same PVC, Payload secret, bridge secret and identity.

## Matched backups and isolated restore

`app_backup.py` is an operator tool, separate from the storage remount helper. Run
it on the existing managed cluster host with the same `WEBDOCK_EXECUTOR_LOCK` as
the daemon. The config must be private (`0600`) and owned by the operator:

```json
{
  "projectID": "PROJECT", "clusterID": "CLUSTER", "appID": "APP",
  "databaseID": "DATABASE", "backendID": "DATABASE_BACKEND",
  "namespace": "wd-PROJECT", "deploymentUID": "OBSERVED_UID",
  "pvcUID": "OBSERVED_PVC_UID", "databaseClusterUID": "OBSERVED_CNPG_UID",
  "image": "ghcr.io/OWNER/CMS@sha256:EXACT_DIGEST",
  "helperImage": "APPROVED_POSTGRES_IMAGE@sha256:EXACT_DIGEST",
  "volumeBytes": 2147483648
}
```

The helper image must have `sleep`, `tar`, `find`, and `/bin/true`, support UID
65532 and satisfy the cluster's existing immutable-image admission policy.
PostgreSQL's existing `postgres-1` pod supplies `psql`, `pg_dump`, and `pg_restore`.
The tool checks DB role ownership and exact deployment/PVC/CNPG identities.

Mount an **existing separately hosted** NFS, CIFS or SSHFS backup destination.
Confirm its capacity: the tool requires room for twice the configured media
capacity plus twice the current database size. It rejects a local filesystem as
a disaster-recovery destination. Install scheduling only after a real backup and
restore acceptance run succeeds.

```sh
python3 app_backup.py backup --config /root/cms-backup.json --directory /mnt/existing-backup/cms --prune
python3 app_backup.py restore --config /root/cms-isolated-restore.json --directory /mnt/existing-backup/cms/TIMESTAMP-APP
```

Backup disables login for both runtime and migration roles, terminates existing
DB sessions, stops the exact Deployment, and waits until the PVC has no users.
It then writes a schema `app` custom dump, a logical row fingerprint, and a media
archive to one set, with image/schema metadata and SHA-256 hashes. The original LOGIN/NOLOGIN flags for both roles are saved in `fence.json` before
fencing. Only a fully verified set allows each original role flag and serving
state to be restored; a role that was disabled stays disabled. Failure leaves the source
fenced for operator review. `--prune` retains seven daily and four weekly verified
sets for this app; unrelated or malformed directories are retained.

Restore requires a separate project, app, database and PVC with the recorded CMS
image an empty media directory, and a fresh unmigrated database with an empty `app`
schema. It never overwrites the source. It restores
schema/data and media, reestablishes DML-only grants, compares restored logical
rows and every media file hash, and leaves the restored instance stopped with
both DB roles fenced. Review its result, re-enable the two exact roles, and start
the isolated app for acceptance before considering a production recovery.

The tool does not yet schedule backups. Cert-manager renews each owned instance
certificate independently of the plugin or agent polling. Unit
checks are not proof of recovery: a real fresh instance, media restart, role/SSO
checks, backup and isolated restore are release requirements.

## Additional database pools

Existing single-pool `/etc/webdock-postgres.json` remains valid. To add a reviewed
pool without replacing the existing `storageSocket`, configure at most seven
additional trusted routes:

```json
{
  "storageSocket": "/run/webdock-postgres-storage/control.sock",
  "additionalStoragePools": [
    {
      "node": "wd-eu-01",
      "poolID": "OPERATOR_CREATED_POOL_UUID",
      "storageSocket": "/run/webdock-postgres-storage/cms.sock"
    }
  ]
}
```

Keep all other existing database config fields. These sockets must be root-owned,
mode `0600`, under `/run/webdock-postgres-storage`, and connected to the existing
strict storage service protocol (a trusted local proxy can preserve a remote
pool). The helper's own config still pins its exact node, pool UUID and cluster.
Routes, nodes and pool IDs must be unique. Each operation contacts only its exact
configured additional pool, or the legacy primary helper; the helper verifies
cluster/node/pool ownership. A partial node/pool match is rejected, and an offline
additional pool never falls back to the primary. Unavailable sockets are omitted
from heartbeat capacity, while malformed or conflicting identities still fail
closed. All reachable identities are checked before pool availability filtering.
When the cluster passes its existing readiness check, a valid but unready storage
helper or individually ineligible pool is omitted without withdrawing healthy
pools. The pool collector also filters unready/cordoned/tainted nodes and node
pressure defensively; it returns no capability if no eligible pool remains or
shared controller/admission validation fails. Plugins cannot supply socket paths
or placement.

The existing cluster-wide readiness prerequisite remains unchanged: the normal
observer refuses a heartbeat if any Kubernetes node is `NotReady`, before it
collects database pools. The daemon therefore does not claim database or other
work through that failed observation. There is no database-only heartbeat or
claim bypass. Pool/helper independence applies when this cluster-wide check
passes; it does not promise continued claims through an unrelated NotReady node.

Capability collection reads Kubernetes nodes, pods and Services once and computes
conservative existing resource counters independently for each pool. No admission
formula or customer quota is relaxed. Ensure, state, retain and purge use the
exact backend node/pool pair. Installing/registering a new bounded pool and any
physical storage rebudget remain explicit operator steps.

The disposable local acceptance command exercises two actual root-authenticated
Unix-socket helpers without mounts, external networking or production files:

```sh
docker run --rm --network none --read-only --tmpfs /tmp --tmpfs /run \
  -v "$PWD/agents/kubernetes:/tests:ro" -e PYTHONDONTWRITEBYTECODE=1 \
  python:3.13-alpine python /tests/check_database_pools_rpc.py
```

It verifies separate pool inventories, exact state/retain/purge routing, rejection
of purged storage recreation, cross-pool denial, and continued primary state/retain
operations after the additional helper is stopped and its socket removed. Real fresh filesystem
allocation, cert-manager issuance and restoration still require cluster acceptance.
