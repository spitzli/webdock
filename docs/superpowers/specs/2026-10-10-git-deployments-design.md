# Git deployments and GitOps in Webdock

Status: written design for review; no implementation or production activation yet.
Date: 2026-10-10.

User override, 2026-10-10: EU placement is a best-effort preference for isolated build workers, not a geographic enrollment blocker. Record actual country metadata; `ZZ` requires explicit unverified-location evidence. Verified VM isolation and all credential, artifact and runtime boundaries remain mandatory. Earlier EU-only worker wording below is superseded by this instruction.

## Intent and agreed scope

Customers must connect their own GitHub accounts/organizations and selected repositories from the first release. Webdock owns the daily workflow: repository selection, build configuration, build logs, release approval, deployment status and rollback for managed containers and Vercel applications. GitHub installation/consent and provider consent remain external authorization ceremonies.

The user approved the proposed direction and requested implementation. This file makes the architecture, first delivery and operational prerequisites reviewable. It does not claim that new GitHub permissions, deployment credentials, a registry or isolated build capacity are already available.

## Existing implementation to reuse

- `apps/admin/src/lib/github.ts`, `github-routes.ts`, `github-project.ts`: existing GitHub App OAuth, operator-bound session and verified repository selection. Present permissions are Metadata read; credentials are browser-session scoped. This is not yet unattended deployment access or customer selfservice.
- `apps/auth/src/lib/hosting/`: canonical authorization, customer policies, PostgreSQL journal, quotas, leases, revision checks, app lifecycle and encrypted environment handling.
- `apps/admin/src/lib/hosting-client.ts`, `hosting-api.ts`, `hosting-mcp.ts`: Studio, REST and MCP access to the same authorized hosting service.
- `packages/hosting-contracts/`: shared validated commands and errors.
- `apps/hosting-agent/`: outbound authenticated agent, controlled Kubernetes executor, observation and recovery. Current container pull policy is `Never`; registry integration must be implemented explicitly.
- `apps/auth/src/lib/hosting/byok-vercel.ts`: tenant-bound Vercel connections and selected projects. Existing read/cancel/region capabilities do not establish deployment-upload capability.
- `packages/i18n/`: English UI source/fallback, German gettext catalogs.

Existing uncommitted work is extensive and is part of the current baseline. Do not reset, replace, commit or publish it implicitly. No existing customer deployment is automatically adopted into the new pipeline.

## Delivery boundaries

### First delivery: complete Git-based deployment workflow

Customer GitHub connection, verified repository binding, Dockerfile/Vercel build recipes, a persistent build queue, isolated EU worker execution, private EU artifacts, deployment through the existing hosting authorization path, production approval, logs and rollback. Both platform-managed and customer-owned Vercel connections are supported only when their actual credentials can perform the required operations.

Pushes to the configured branch build automatically. Production publication initially requires approval by an authorized Webdock actor. An explicit project setting may enable automatic publication after all checks pass. A user-triggered rebuild resolves and records an exact commit; it never deploys an unspecified moving branch.

First delivery supports already configured deployment targets. Generic domain/TLS provisioning and automatic pull-request preview environments are separate increments. Existing container resource/security restrictions remain enforced; unsupported images fail clearly instead of weakening the runtime baseline.

This first delivery is described in UI and documentation as Git deployments. It is not advertised as full GitOps.

### Second delivery: previews

PR builds and temporary environments, after generic container ingress/TLS is available. Preview resources count against customer quotas. Forks/untrusted PRs receive no production secrets and cannot deploy automatically. Expiration may stop a preview; resource/data deletion must still use the platform-administrator lifecycle service and its authorization.

### Third delivery: versioned desired state

A Webdock-managed configuration repository per customer records releases and non-secret runtime configuration. Git becomes the authority for desired state; PostgreSQL remains the operational queue, index and audit journal. UI changes become commits or review requests, and background reconciliation applies accepted revisions. Storage and backup of these repositories must have verified EU placement; a hosted GitHub repository must not be assumed to meet that requirement.

## Components and ownership

1. **Studio** renders configuration and status and delegates authorized commands. It never runs builds in request handlers or exposes provider credentials to the browser.
2. **Auth hosting service** validates tenant/project ownership, Git connection grants, deployment targets, quotas and release transitions. It persists jobs and audit records.
3. **GitHub integration service** verifies signed events, obtains narrowly scoped installation tokens, fetches source at a pinned revision, and reports checks. Installation private keys stay in the trusted service.
4. **Build worker** leases work over outbound HTTPS. It creates a disposable execution environment and reports bounded logs/artifacts. Source build scripts cannot access worker enrollment credentials, Vercel credentials, registry administration, Kubernetes credentials or other builds.
5. **Deployment adapters** consume verified immutable artifacts. Container deployment reuses the hosting agent and reservations. Vercel deployment uploads prebuilt output through a trusted publisher, separately from untrusted build execution.

Use PostgreSQL for the durable queue and existing transaction patterns. Do not introduce Redis, a second auth service or a separate customer registry for this feature.

## Customer GitHub installation flow

An active authorized customer administrator starts connection from their Webdock customer context. Operators may configure a customer's connection explicitly; read-only customer preview cannot mutate anything.

OAuth state and the installation flow bind the actor, session, customer, nonce and expiration. A returned installation ID alone proves neither tenant ownership nor repository permission. Before persisting the binding, server-side GitHub calls must establish that the authenticated GitHub user can access the installation and the selected repository, and that the installation grants the app access.

An installation has one owning Webdock customer by default. Linking it to a different customer is rejected. Cross-customer agency sharing requires a future explicit delegation model, not a URL or ID override.

Persist stable installation/repository IDs and canonical display metadata. Repository renames do not break bindings. Removal, suspension and repository-transfer events cause revalidation; new work fails closed when access is no longer established. In-flight publication checks the connection generation again. Disconnecting source access does not delete running applications.

App permissions for the first delivery: Metadata read, Contents read, Checks write; add Pull requests read when PR functionality is enabled. Subscribe only to required push/installation/repository-access events. Changing registration permissions requires GitHub installation-owner consent; current installations do not silently gain permissions.

Existing metadata-only operator connections remain usable. Unattended jobs use installation tokens scoped to the exact repository and required read permissions; they do not reuse the eight-hour browser cookie. No application-source write permission is needed for the first delivery. The later configuration repository uses a separate narrowly scoped writer.

## Data model and authority

Add explicit migrations under the existing `webdock_auth` schema. No request-time schema creation. Platform IDs remain decimal Snowflake strings.

| Record | Purpose and constraints |
| --- | --- |
| Git connection | Customer, provider, installation ID, account metadata, granted permissions, lifecycle state and generation; installation ownership unique |
| Deployment source | Customer/project, connection, repository ID, branch, root directory, recipe, target, config revision and enabled flag |
| Build | Exact source SHA, config revision, environment revision, worker generation, status, lease, timestamps and bounded failure code |
| Artifact | Build, customer, type, immutable digest/checksum, controlled storage key, size, provenance and retention state |
| Release | Project/environment, artifact, intended revision, approver, linked hosting operation or provider deployment ID, observed status |
| Event receipt | Provider delivery ID, minimal event metadata and processing state; unique delivery ID prevents duplicates |
| Worker | Enrollment, credential hash, generation, verified location evidence, isolation capabilities and finite capacity |

Foreign keys and transactional checks enforce that connection, source, build, artifact, release and target belong to the same customer. Client-supplied tenant IDs are selection inputs, never authorization evidence. Audit records preserve actor identity and distinguish an automated policy decision from interactive approval.

## Jobs, races and recovery

Webhook processing validates the raw-body HMAC, payload size and allowed event type before accepting the event. A single transaction records the delivery and queues eligible work. Return promptly; build execution is asynchronous. Do not log whole webhook payloads or credentials.

Build states: `queued`, `running`, `succeeded`, `failed`, `cancelled`. Worker leases include a generation/fencing token. An expired worker cannot overwrite a replacement worker's result. Duplicate delivery and explicit retry semantics are separate: repeated delivery does nothing, an authorized retry creates a new build attempt.

Release states: `awaiting-approval`, `queued`, `deploying`, `ready`, `failed`, `superseded`, `needs-reconciliation`. Approval binds the exact artifact and intended configuration. Publication is serialized per project/environment. A stale build can remain inspectable but cannot replace a newer desired release automatically.

Provider timeout after a possible write enters `needs-reconciliation`; inspect known provider IDs/metadata before retrying. A successful upload is not a ready deployment. Ready requires target observation and configured health verification. GitHub check status follows actual progress.

Rollback creates a new desired release referencing a retained known-good artifact and compatible configuration. It does not rebuild an old commit or silently restore a database. Database schema migrations remain explicit, separately authorized operations with application compatibility assessed before rollback.

## Build execution and secrets

Use dedicated DE/EU build capacity, separate from the production application node. Customer-controlled build scripts require a disposable VM or equivalent independently validated isolation boundary. A shared privileged Docker socket and an ordinary shared-kernel container alone are not accepted as that boundary. Verify the worker provider location and supported isolation before enrollment enables work.

Support a repository Dockerfile and a pinned Vercel CLI build recipe initially. Validate root directories against checkout escape, reject unsafe archive paths/symlinks on source and artifact boundaries, constrain artifact size, and validate permitted output formats. Install dependencies from the lockfile; use Node 24 for Webdock projects. Set CPU, memory, disk, duration and concurrency ceilings.

Fetch private source in a trusted preparation step with a narrowly scoped short-lived credential; do not leave the credential in Git config or the build environment. Build secrets and runtime secrets are separate. Only explicitly authorized per-project/environment build secrets reach customer code; assume that code can read them. Never inject provider deployment credentials into the build sandbox.

Caches and artifacts are tenant-scoped. Untrusted/fork builds cannot populate trusted production caches. Build logs are bounded, escaped as text in UI and subject to retention. Redaction is defense in depth, not a substitute for withholding secrets. Credential-bearing command arguments and full environment dumps are forbidden.

## Container publishing

Store OCI images in a private registry with verified EU storage, backups and bounded retention. Trusted publication records the immutable digest. Runtime pull credentials grant read access only to authorized repositories and remain outside the app container and public API.

Extend the agent protocol with validated registry capabilities and a controlled immutable-image pull path. Continue rejecting arbitrary manifests and host shell commands. The existing quota/ownership/lease checks still gate deployment. BYOK clusters need explicit registry reachability and credential installation; a connected cluster is not assumed to support this automatically.

Continue using the present Recreate strategy unless a separate capacity-aware rollout change is implemented. Do not promise zero downtime. Failed readiness keeps the failed release visible and retains the previous successful release reference.

## Vercel publishing

Bind the selected Webdock project to an authorized Vercel team/project. Check actual connection permissions and project access before activation; if upload/deployment operations are unavailable, show a reconnect/setup requirement instead of substituting an unrelated global token.

Disable/verify absence of competing native Vercel Git builds when Webdock owns publication. Existing deployment history and domains are retained. New projects get `functionDefaultRegions: ["fra1"]` before first publication. Validate repository overrides and generated function metadata, then verify the actual deployment region via provider metadata.

Run `vercel build` in the isolated EU build environment using the correct target's permitted build configuration. Upload only through `vercel deploy --prebuilt`. Keep provider credentials in the trusted publisher. Do not blindly promote a preview artifact built with preview-only values into production; target-specific build-time values are part of artifact identity.

Vercel CDN/control plane/artifact processing remain global. This path provides EU-controlled build execution and verified Frankfurt Functions, not a full EU-only guarantee. Do not enable source uploads or US-hosted remote builds as a fallback.

## Webdock UI, REST and MCP

Reuse existing hosting layout, shared tables, forms, errors and delegated session handling. Add repository/source settings and deployment history to project hosting pages. Display setup blockers with specific missing capabilities; hide secrets and avoid returning raw provider errors.

Provide the same service operations to UI, REST and MCP: inspect connection/source, configure source, list/read builds and releases, request build, cancel build, approve release and request rollback. GitHub consent and worker enrollment secrets stay on their existing interactive/trusted administrative paths. New operations must check applicable scopes, active membership and tenant-preview denial.

Deletion remains platform-administrator-only through the existing lifecycle service. Disconnecting GitHub, deleting a branch or removing a config file must never delete a production project, namespace, volume or database.

English source/fallback; German translations in gettext catalogs. Extract, translate, compile and verify new messages. Do not translate repository names, branch names, customer-authored values or logs.

## Full GitOps extension

The configuration repository stores immutable release references, resources, replicas, domains and secret version references. No raw secret, token or database URL belongs in Git. A Webdock edit includes the expected Git revision; concurrent edits produce an explicit conflict rather than replacing newer configuration.

The reconciler periodically compares the accepted Git revision to observed state, so missed webhooks do not permanently lose changes. Git unavailability preserves the last accepted desired state. Drift is surfaced; destructive drift never bypasses the operator-only deletion policy. Emergency pause/stop has an explicit recorded override that reconciliation respects until cleared.

Webdock remains the single owner of managed resources. Resources already controlled by Flux/Argo/Terraform are not adopted implicitly; the current BYOK conflict guard remains. A later integration can delegate desired state to one of those controllers, with one writer per resource.

## Verification and acceptance

1. Two tenant fixtures cannot list, connect, read logs, build or deploy each other's repository/artifact/target; read-only preview is denied for every mutation.
2. Forged installation callbacks, replayed state, expired sessions, removed repository access and suspended installations fail closed.
3. Webhook HMAC failures, duplicate deliveries, out-of-order commits, stale worker completion, concurrent approvals and ambiguous provider responses exercise durable recovery.
4. A local disposable PostgreSQL database verifies migrations, constraints, leases and transactions. Tests refuse production database targets.
5. Fake GitHub/Vercel HTTP services verify contracts; build tests use isolated fixtures and no production secrets. A worker isolation check proves absence of control credentials and cross-build files.
6. A disposable container application completes push/build/publish/pull/readiness/log/rollback through Webdock, including a deliberately failing healthcheck.
7. A disposable Vercel project completes a locally/EU-built prebuilt deployment with matching commit/artifact metadata and verified fra1 Functions. No remote-build fallback is allowed.
8. T3 preview verifies real tenant and operator flows in English/German, including streamed error states and mobile layout; HTTP 200 alone is insufficient.
9. Existing hosting lifecycle, GitHub selection, tenant security and environment tests remain passing. Record exact checks and limitations in `docs/verification/`.

## Activation prerequisites

Implementation can be tested against local fake providers before production activation. Live activation requires: GitHub App private key and webhook secret in the private service environment; approval of new installation permissions by the installation owner; verified DE/EU isolated worker capacity; EU registry/artifact storage and scoped credentials; and deployment-capable Vercel connections.

Discover available private configuration without printing secrets. Do not purchase new infrastructure or claim missing prerequisites are satisfied. Existing Contabo application capacity must not be repurposed into untrusted build capacity implicitly. If a prerequisite is missing, complete the independent implementation and report the exact remaining setup action.

## References

- https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation
- https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks
- https://vercel.com/docs/cli/build
- https://opengitops.dev/
