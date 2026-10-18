# Install plugins from owned sources

The operator can install an external plugin from a GitHub repository (the default),
an HTTPS Git URL, or a ZIP upload. GitHub uses the existing browser-bound GitHub App
connection, including selected private repositories. Other private Git hosts use an
explicit read credential. Credentials never become plugin configuration or build input.

The existing pilot only installs signed registry releases through offline tools and
does not provision runtimes. Source installation must therefore include real durable
work, image publication, runtime provisioning, and authenticated readiness before
claiming success. It must remain independent of the Hosting product.

## Decisions

- Operator-only installation, with a selected active project/customer grant.
- Source is pinned to a commit and normalized archive hash. ZIP sources have a content
  hash. Never execute repository code in the API or an operator shell.
- GitHub App permissions permit Metadata read and Contents read, no writes. Existing
  metadata-only connections still list repositories but cannot import source.
- HTTPS Git only initially. SSH credentials/ambient SSH agent access are not used.
- ZIP up to 32 MiB compressed, 128 MiB expanded, 10,000 files. Reject traversal,
  links, duplicate/case-colliding paths, special files, and ambiguous manifest roots.
- Automatic build and installation uses a private trusted GitHub Actions workflow
  and the existing artifact-only publisher pattern. No extra KVM or build host.
  Source code never executes on the application/database node. The workflow uses
  GitHub-hosted runners, scoped OIDC source access and no platform credentials.
  There is no prebuilt-image choice in this source flow.
- Display exact final manifest capabilities, source identity, image digest, and
  configuration before approval. Source-provided signatures never establish trust.
- Preserve the current runtime pilot's supported manifest boundary; unsupported
  dependencies/schema migrations/tables/jobs fail with an actionable explanation.
- An artifact-only installer on the existing app node owns dispatch/publication/
  Kubernetes privileges. Builds run remotely in the private GitHub Actions repository.
  No Docker socket, registry push key, Kubernetes token, or offline DB credential is
  added to Core API/Console. Unconfigured self-hosts show setup required.
- Durable source jobs use bounded storage, claims, and expiry. Failed or ambiguous
  operations are visible and do not silently overwrite an existing installation.
- Recheck current operator and project authority before grants/activation. Keep the
  existing enabled release unchanged until a candidate is ready. Initial delivery
  rejects replacement of an already-installed plugin; lifecycle update remains the
  existing explicit offline path.

## Acceptance

Public Git, private Git with an explicit credential, GitHub private selected repository,
and ZIP all reach the same verified manifest/review/install flow. A real supported
fixture reaches healthy enabled runtime. Invalid sources, expired/revoked access,
hostile archives, wrong image/readiness identity, and unauthorized requests fail closed.
Core build boundaries, existing GitHub auth tests, and plugin invocation isolation pass.
Documentation explains installer deployment, supported package layout, limits, and
the distinction between source availability and a healthy installed runtime.
