# Plugin source installer acceptance

The KVM build component below was an initial experiment. The final installer uses
a private GitHub Actions workflow and the existing artifact-only app-node pattern,
without an additional KVM or server. KVM evidence below is historical and does not
stand in for acceptance of the Actions source handoff. Runtime/DB/UI boundary
checks remain applicable; final Actions acceptance is recorded separately.

The source installer adds operator-owned GitHub, HTTPS Git and ZIP imports to the
product-free Core. The user explicitly selected automatic image builds. The final
workflow builds on GitHub-hosted runners; the existing app node imports OCI artifacts
and provisions restricted Kubernetes runtimes. Core grants project access only
after review and authenticated runtime verification.

## Initial component acceptance (before Actions handoff)

- Real public and authenticated private HTTPS Git downloads, pinned to commit and
  normalized source hash. Credentials stayed outside returned source archives.
- 78 Python worker/source/deployment tests, including traversal, archive expansion,
  private DNS, credential handling, process bounds, wrong images and Secret CAS.
- Real offline KVM execution of an authored Dockerfile through
  `plugin_installer.build_source` and `worker.execute_vm`, followed by real OCI
  validation and publication to a disposable private TLS registry. The pinned base
  image was unchanged and guest execution had no network or provider credentials.
- Real Kubernetes deployment in an owned disposable kind cluster: private image
  pull, exact requested/observed image digest, restricted PSA namespace, UID 1000,
  read-only root filesystem and no service-account token. Runtime configuration
  Secret update preserved its signing key and used its resource version.
- Authenticated TLS health returned the declared plugin/version/generation;
  unauthenticated health returned 401. Built/deployed fixture image:
  `sha256:a0f3a0358faf28778db22a62a31167bd0141de1699f3787b82dfdf2c8a1a2383`.
- PostgreSQL 18 migration/RLS integration: 73 assertions, including distinct
  operators, worker-purpose isolation, upload and claim fences, exact approvals,
  revoked authority, one-time activation, retention, and safe discard.
- 199 API unit tests; 94 Console tests; API/Console type checks; eight API-client
  tests; three CLI tests and real HTTPS signed-invocation template tests.
- Generated action template builds as a standalone source project and Docker image
  on Node 24.22.0, including its vendored SDK and license notices.
- Core API build and forbidden-product import checks; isolated standalone Core
  Console build has zero product files. API Core JavaScript: 8,257,306 bytes at
  this acceptance checkpoint (about 7.88 MiB).
- Real local password change, MFA, PKCE and authenticated Console. Browser ZIP
  upload transferred 2,125,988 bytes through the production chunk API. Worker
  source download matched the previously built normalized archive exactly;
  replaying that recorded real build result exercised manifest review and
  discard through the actual API/database. No fabricated browser session or
  production identity was used.

Independent review found and fixed selection of GitHub installation IDs above
10,000, host-side Git resource limits and long-source-path transport. Browser
acceptance found and fixed the distinction between Auth subjects (RLS ownership)
and Registry profile IDs (GitHub connection ownership).

## Scope of evidence

Build/publication, runtime provisioning/health and API activation were checked as
separate components. The complete browser-to-Kubernetes-to-API-activation chain
was not run as one live production installation. The database activation test
injects its probe; the actual TLS/runtime checks above are separate. NetworkPolicy
objects were created, but kind network-policy enforcement was not asserted.

The GitHub App's existing public permission metadata was checked and compatibility
tests include its read Actions and write Checks permissions used by Hosting. Source
import itself only reads. A fresh production GitHub OAuth/private-repository import
was not exercised; the real private Git download used an explicit Git credential.

All owned acceptance clusters, registry/tool containers, networks, temporary keys
and kubeconfigs were removed. Private raw VM/OCI artifacts and detailed evidence
remain in the operator's acceptance cache. Production configuration and existing
plugins were not changed by these tests. The final workflow uses the existing app node and a private GitHub Actions build
repository; it does not require a permanent additional build host.

## Final Actions rollout acceptance

The final installer was exercised against the live Console and API with owned
fixtures. Both a ZIP upload and a private GitHub repository completed the normal
build, manifest approval, runtime deployment and activation flow. The installer
page was closed after approval; database state reached `enabled` through the
background worker. No fabricated operator session or manual activation was used.

- Existing Clerk operator authentication and the existing GitHub connection were
  used. The private repository picker returned granted repositories, and the chosen
  branch was resolved to an immutable commit before the build.
- Four real private GitHub Actions runs succeeded. OIDC source handoff, OCI artifact
  validation and publication ran through the production installer protocol.
- The final ZIP and GitHub fixtures were approved with no capabilities and empty
  configuration. Kubernetes observed exactly the reviewed image digests:
  - ZIP: `sha256:dbcc7fad5dc3b9aefeb58bac38668ca6c882f61588af0e0ce0312046c5b99ee8`.
  - GitHub: `sha256:44982c032829e0fa7a056952ae5d5e2f3629696997be9a64c46763ad779167d8`.
- Authenticated health from the actual Bun API returned the exact plugin identity,
  version, generation and protocol. Both plugin UI hosts obtained trusted HTTPS
  certificates through the existing Traefik HTTP-01 resolver and returned 200.
- Both sandboxed Console iframes executed the signed `demo.echo` action and returned
  the expected message through the actual Console → API → runtime → iframe path.
- The final runtime ran as UID 1000, had no mounted service-account token, rejected
  root-filesystem writes with `EROFS`, and allowed writes in its bounded tmp
  volume. DNS and the allowed Webdock API worked. External HTTPS was rejected;
  a controlled TCP destination reachable from the node was rejected from the pod.
  This verifies the tested egress paths, not every possible network destination.
- Migrations 0046 and 0047 and the offline RLS update committed atomically after a
  fresh logical backup. The temporary migration credentials, extra grants and HBA entry were
  removed; the offline role was disabled. API and worker images passed readiness with their existing pod
  configuration preserved. Console changed through a guarded upstream switch;
  the Auth upstream and the original pod quota were retained.

Live acceptance found and corrected missing GitHub integration cookies in the
Clerk Console transport, use of the k3s bootstrap launcher as an unprivileged
kubectl client, missing runtime liveness probes, namespace admission readiness,
and Ed25519 transport-certificate incompatibility with Bun's HTTPS client. The
final generator uses RSA-2048/SHA-256 transport certificates; Ed25519 invocation
signatures are unchanged. The fresh final ZIP and GitHub installations used the
corrected generator without workload patches.

The final focused review found no blockers. Fresh checks include 9 API-client
tests and 101 Python tests with Node 24, including an actual Bun-to-Node TLS test
that rejects a wrong CA and wrong hostname. Earlier unchanged-scope checks remain
205 API unit tests, 148 PostgreSQL/RLS assertions, 94 Console tests, CLI checks and
Core isolation builds. Mintlify validation and broken-link checks passed.

The initial KVM experiments above are historical only. The delivered path uses
GitHub-hosted builds and an artifact-only publisher on the existing application
node; it requires no extra KVM host. Source installation remains an opt-in alpha
for actions and scoped documents. Dependencies, tables, migrations and jobs are
rejected explicitly. Detailed operational evidence and fixture cleanup records
are retained privately; existing Managed Apps and Analytics are outside the
fixture cleanup scope.
