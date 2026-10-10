# Webdock observation and managed execution bridge

Source update, 2026-10-09: optional fixed-size persistent app storage is implemented and verified locally, but not installed on production Contabo. See [storage operation and installation boundary](../../docs/architecture/persistent-app-storage.md). The normal agent keeps its existing sandbox; `storage_client.py` talks to the separately installed root-only `storage_service.py`. Customer BYOK installation does not install or enable that privileged helper. The standalone SSH bridge includes the client dependency in its transmitted code.

Use `--manage` to process authenticated Webdock app operations in addition to node observations. Without that flag, the bridge remains read-only. Active mode accepts only the fixed typed executor protocol: controlled namespace/Pod/Service manifests, safety dry-runs, revision/lease/ownership checks, rollout observation, bounded logs and confirmed application deletion. It has no arbitrary tenant shell or YAML interface.

Production now runs `daemon.py` as the enabled `webdock-hosting-agent.service` on Contabo. It connects directly to `https://auth.webdock.dev`, observes the node and processes managed operations every 15 seconds. Code: `/opt/webdock-hosting-agent/`; root-only connection state: `/var/lib/webdock-hosting-agent/connection.json`. No workstation or SSH process is needed. The local bridge below is an optional development tool and has been stopped. Lifecycle operations were verified on the real node with the local control plane before rollout; production enrollment, heartbeats and rendered administrator pages were verified separately. See `docs/verification/2026-10-08-hosting-production.json`.

```sh
python3 apps/hosting-agent/connect.py \
  --ssh root@213.136.65.22 \
  --identity ~/.ssh/codeberg_1p.pub \
  --credentials /private/webdock-agent.json \
  --manage --interval 15
```

HTTPS is mandatory except for explicit local `--allow-loopback` verification. Credentials must have mode 0600 and stay outside Git. Operations are sent through the authenticated Webdock service; never call the executor directly as a substitute for Webdock deletion authorization and its journal.

Supported now: cached immutable HTTP images, positive CPU/RAM/ephemeral quotas, restricted Pods, temporary /tmp, controlled ClusterIP services. Persistent PVCs and external registry pulls are disabled. New managed project/validation namespaces are distinct from the server baseline namespaces.

Managed apply operations observe readiness for at most 180 seconds. Both executor
transports allow 260 seconds for preparation and observation; the Auth operation
lease is 300 seconds. Lease expiry still interrupts work and timeout requires
reconciliation. Deploy the matching control-plane and agent changes together.
See [the production timeout evidence](../../docs/verification/2026-10-10-lunares-actions-production.md).

Run tests with `python3 -m unittest discover -s apps/hosting-agent -v`.

## Historical observer-only background (superseded by managed daemon above)


This is a local SSH observation bridge, not a Kubernetes workload executor. It reads nodes and sends allowlisted metadata to Webdock. It never installs remote files, reads Kubernetes Secrets, changes namespaces or runs arbitrary commands from the control plane. Deployable capacity stays zero until a future executor verifies scheduling reserves, network, storage and ingress capabilities.

Run the tests:

```sh
python3 -m unittest discover -s apps/hosting-agent -v
```

After protected Studio enrollment, store the agent response in a private mode-0600 JSON file with `endpoint` (control origin), `clusterID`, `credential`, `generation` and `sequence: 0`. Do not put the file in Git or paste its credentials in chat. Supply the public identity path for the existing SSH agent; never copy a private key into this application.

```sh
python3 apps/hosting-agent/connect.py \
  --ssh root@213.136.65.22 \
  --identity ~/.ssh/codeberg_1p.pub \
  --credentials /private/webdock-observer.json \
  --once
```

HTTPS is required except for explicit local testing with `--allow-loopback` and a loopback origin. Omit `--once` to observe every 30 seconds. SSH host-key checking is mandatory. Redirects are rejected before credentials could be forwarded. Errors stop the bridge and do not change cluster state. A revoked agent cannot reconnect without a new enrollment.

The original connection was local-only; the owner subsequently requested and authorized production rollout while retaining Studio/Auth on Vercel. Server location evidence and local-path storage limitations are documented in `docs/architecture/hosting-control-plane.md`.
