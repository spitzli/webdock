# Git deployment live-component acceptance

These checks extend `2026-10-10-git-deployments.md`. They were run against real disposable infrastructure on 2026-10-10. EU placement is a preference following the user's clarification; local hardware location was not asserted.

## Real KVM and OCI path

An official Ubuntu minimal image was checksum-verified and prepared with guest BuildKit. The production `worker.execute_vm` path ran six acceptance cases with actual QEMU/KVM:

- Dockerfile build producing an immutable OCI HTTP application (about 2.6 seconds).
- A fresh second VM could not see the first build's cache marker.
- A host-only environment canary and worker credential path were absent; the metadata IP was unreachable with networking disabled.
- Deliberately failing commands preserved diagnostics; log flooding was bounded at 24,000 bytes.
- Guest execution timeout and a separate host watchdog terminated the job; no QEMU child remained.
- The base image hash stayed unchanged and temporary execution files were removed.

Actual open-file inspection verified one writable root snapshot, an unchanged read-only base disk, a read-only input disk and a write-only result file. The tests exposed and fixed slow bulk `fw_cfg` transport, incorrect boot ordering, global snapshots affecting the input disk, short virtio writes truncating output at 32 KiB, and source modes breaking non-root images.

The resulting image `sha256:5c68a5487c0efe8c959ff8c200269d272f965bb93b8a14226dfe006a739910a1` passed the production OCI validator and publisher. The real `skopeo` command ran in a dedicated tool container; no publishing response was mocked.

A disposable `kind-webdock-git-e2e` cluster pulled from a private TLS registry and ran the production hosting executor (a local `k3s kubectl` shim selected only the loopback test kubeconfig). Anonymous registry requests and write attempts using the pull credential were denied. The app returned `webdock-real-kvm-e2e`. A deliberately invalid health path caused `rollout_timeout`; rollback to the retained digest reached revision 3 and became healthy again. Runtime checks confirmed UID 65532 and a read-only root mount. Kind's network-policy enforcement was **not** claimed verified.

Reproduction drivers: `apps/build-worker/e2e_real_vm.py` and `apps/hosting-agent/e2e_git_registry.py`. Both require explicit disposable test inputs; neither is part of normal unit-test discovery.

## Real Vercel path

Pinned CLI 63.1.2 ran an actual Node 24 `vercel build --prod` on an authored fixture with a scrubbed build environment and no provider login/token. Its output passed the actual artifact validator, then `publisher.publish_vercel` performed the real prebuilt upload. The test runner only mapped the fixed CLI executable path to the pinned local installation; command execution, private authentication file handling and publication were real.

The production TypeScript observer resolved and uniquely reconciled deployment `dpl_AESwi8fsiiiEnmotKAJha2kvjDdd`, observed `ready` in `fra1`, and an unauthenticated health request returned HTTP 200 with `fixture: webdock-real-build-publisher` and `region: fra1`. A prior default-protected fixture correctly failed health verification; only the disposable project's protection was changed for the public health test. All disposable Vercel projects were removed and their deletion confirmed with 404 responses.

Real CLI output exposed compatibility gaps: generated boolean metadata names, omitted per-function regions inheriting the trusted Frankfurt default, and `builds.json`. The validator now accepts the pinned CLI's supported format, rejects explicit foreign regions, and the publisher strips guest paths/arguments/build configuration while preserving production-target validation metadata.

## GitHub evidence and remaining boundary

The actual `spitzli/webdock-studio` App key was found privately and its public fingerprint matched GitHub. App-JWT requests authenticated successfully. The owner accepted Contents **read-only** and Checks **read/write**, preserving Metadata read. Existing selected repositories were retained and a separate private test repository was added.

The actual local Webdock OAuth exchange and installation picker succeeded after fixing a loopback-callback mismatch; production still requires HTTPS. GitHub delivered a real signed `installation_repositories` event to the real webhook handler with HTTP 202. A missing-key environment-variable mismatch and an incorrect Vercel-branded GitHub error page were also fixed.

The user then requested PR, merge and Vercel deployment before further tests. Therefore the complete GitHub push → durable queue → worker → approval → production-adapter chain was paused before its first test push. Component acceptance above must **not** be represented as that complete chain passing. Proxy-enabled guest egress, hostile disk exhaustion and the Vercel recipe inside the KVM image remain separate unperformed acceptance checks.

## Pre-merge recovery fixes

Independent review found two further regressions. Releases now retain an immutable target snapshot so observation-only reconciliation can finish after source, environment or GitHub connection changes. Registry policy preserves cached-image `Never` behavior outside managed registries while denying unauthorized cached private-registry images across projects. Database and Python regressions reproduced the old failures and passed after the changes.

The explicit production migration has been applied for the user-authorized rollout as `webdock_auth_runtime`. All 11 Git tables are owned by that role and its SELECT/INSERT/UPDATE/DELETE access was verified. Only private Auth-project GitHub variables were configured; no production workers, registry or customer source bindings were created by this rollout preparation.
