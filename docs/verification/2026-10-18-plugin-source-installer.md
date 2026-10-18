# Initial plugin source installer component acceptance

The KVM build component below was an initial experiment. The final installer uses
a private GitHub Actions workflow and the existing artifact-only app-node pattern,
without an additional KVM or server. KVM evidence below is historical and does not
stand in for acceptance of the Actions source handoff. Runtime/DB/UI boundary
checks remain applicable; final Actions acceptance is recorded separately.

The source installer adds operator-owned GitHub, HTTPS Git and ZIP imports to the
product-free Core. The user explicitly selected automatic image builds. A separate
worker uses the existing KVM and OCI publication boundary and provisions a
restricted Kubernetes runtime; Core grants project access only after review and
authenticated runtime verification.

## Verified

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
