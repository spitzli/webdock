# Tenant-owned Kubernetes / k3s (BYOK)

Date: 2026-10-09. Status: owner-approved design; core implementation deployed. Actual verification and scope limits are recorded in ../../verification/2026-10-09-byok-hosting.json. The later Vercel addition uses separate tenant connections through the existing integration.

## Requested outcome

A platform operator can enable selfservice for an individual tenant to connect and manage its own Kubernetes or k3s clusters. The owner explicitly selected management of **existing applications**, including scaling, restarting and logs, in addition to resource discovery. Studio, REST and MCP must expose the same authorized service. This extends the live hosting control plane; it does not replace it.

Existing source changes remain intact and uncommitted. No additional workstation shutdown is authorized by this request.

## Selected approach and alternatives

Extend the existing outbound agent, enrollment, tenant membership, audit and durable operation machinery. Make Kubernetes access portable through a configured kubectl executable and local kubeconfig, preserving the current k3s command as a compatibility option. Credentials remain on the customer's agent host. Supply a versioned downloadable installation bundle and explicit service installation instructions; use no unverified public image registry or remote build. An agent may run on a customer-controlled management host with access to the Kubernetes API; it need not run on every node.

A direct control-plane connection using uploaded kubeconfig would require Webdock to hold Kubernetes credentials and reach private APIs. Reject this approach for the initial delivery. A separate Kubernetes dashboard would duplicate the existing authorization and journal and would not satisfy the integrated API/MCP workflow.

No arbitrary tenant-provided shell commands, kubeconfig uploads or YAML execution. An in-cluster Helm/image distribution channel is a possible later packaging improvement, not required for the first portable agent release.

## Tenant entitlement and ownership

Add an operator-controlled BYOK policy for each canonical customer: enabled, finite maximum registered clusters, whether existing-workload management is allowed, and permitted namespaces. Cluster-specific allowed namespaces can narrow that policy. No wildcard management of system namespaces; kube-system, kube-public, kube-node-lease and agent infrastructure are protected.

Use explicit cluster ownership: platform-owned versus tenant-owned with immutable canonical customer ID. An existing dedicated platform cluster must not silently become customer-owned. Customers cannot attach an arbitrary existing cluster ID, transfer ownership, change their own entitlement or access another tenant's inventory.

Active tenant members may read permitted cluster data; tenant owners/admins may enroll and perform enabled management actions. Platform operator access continues to require the existing MFA-backed security state. Customer-preview sessions remain read-only and cannot trigger scans, logs, enrollment or operations. Enforce the policy identically at browser actions, REST/MCP, job creation and job claiming; a policy change prevents queued unauthorized actions from executing.

Registering clusters enforces the maximum transactionally. Revoked records continue to count to prevent entitlement bypass through repeated registrations. A connection-archive interface is deferred; the operator can change the registration allowance. No Kubernetes cluster or customer workload is deleted.

## Enrollment and installation

Reuse short-lived, single-display, one-use enrollment and generation-bound revocable agent credentials. Tenant enrollment must require the owning active customer's admin/owner role and enabled policy. The enrollment response and credential exchange are never placed in ordinary audit logs or URLs.

The agent calls Webdock over outbound HTTPS. Kubernetes credentials and TLS verification stay on the agent host. Installation instructions include explicit RBAC for discovery and optional management of selected namespaces. No blanket cluster-admin binding. Existing Contabo systemd installation remains compatible.

Use a stable cluster identity obtained from Kubernetes (such as the kube-system namespace UID), reported and pinned on connection. Re-enrollment with a different identity requires a clear operator-controlled replacement flow; a stale agent or an accidentally changed kubeconfig must not mutate another cluster. Server-side generation/identity checks accompany every job.

The agent collects API discovery and authorization capability results. Unsupported APIs and denied permissions appear as unavailable capabilities. Location evidence is required under the existing EU policy; a client assertion is labeled as such, not presented as provider verification.

## Inventory and scan

Show Nodes and their health, namespaces, Deployments, StatefulSets, DaemonSets, Pods, Jobs, CronJobs, Services, Ingresses, PVCs and StorageClasses. Show requested and limited CPU/RAM, allocatable node resources, workload readiness/replica counts, restart counts and PVC requested capacity. CPU/RAM usage is optional from metrics.k8s.io, with timestamp and clear unavailable state when Metrics Server is absent. PVC requested capacity is not actual bytes used or hard quota enforcement.

Publish only explicitly allowed fields: stable UID, API kind, name, namespace, selected status, resource totals and capability flags. Do not send full Kubernetes objects, Secret/ConfigMap contents, environment values, arbitrary annotations or arbitrary event messages. Logs are an explicit bounded live operation, with access/audit controls; their content can contain application data.

Persist a bounded inventory snapshot separate from the small heartbeat, with scan ID, observed timestamp, resource counts, pagination/completeness, and individual API failures. Walk Kubernetes paginated lists with request deadlines and total bounds. Never silently show a truncated snapshot as complete. Mark old data stale; absent permission or a failed scan is not evidence that resources were deleted. An unhealthy node must remain visible rather than aborting the entire observation.

Offer periodic scans and an explicit rate-limited refresh operation. Filter tenant views to the permitted namespaces and approved cluster-level summaries; namespace restrictions must apply to stored responses as well as UI filters.

## Existing application management

Discovered resources are **external resources**, not synthesized Webdock hosting apps. Maintain UID, resourceVersion and current desired state when creating operations; re-read immediately before execution. Reject replaced resources, expired jobs, unsupported capabilities and namespace-policy changes. Do not adopt ownership labels, rewrite pod security settings, overwrite Services or apply the managed namespace baseline to existing applications.

Initial supported actions:

- Deployments and StatefulSets: scale, stop (zero replicas), start (restore the recorded nonzero replica count), rollout restart, bounded Pod logs.
- DaemonSets: rollout restart and bounded Pod logs; no fake scale/stop semantics.
- CronJobs: suspend/resume and inspect associated Jobs/Pods.
- Jobs and standalone Pods: inspect and bounded logs; no arbitrary recreation or shell exec.

For scaling use the Kubernetes scale subresource with concurrency preconditions. Rollout restart performs a minimal patch to the pod-template restart annotation with concurrency checks. Preserve the remaining spec. Stop/start records the prior replica count and refuses an ambiguous restore. Do not force StatefulSet rolling updates where updateStrategy cannot deliver the requested behavior; report actual capability or a clear blocked result.

HPA-controlled scaling is blocked with an explanation. Recognized GitOps/controller ownership produces a conflict warning/block for conflicting mutations; do not promise exhaustive GitOps detection or permanent changes against an external reconciler. Never modify HPA, GitOps objects, RBAC or system workloads to force success.

Success requires observing the intended state, not just receiving an accepted patch. Failed and uncertain operations remain visible, and resource versions/UIDs prevent blindly replaying a change against another object. Retrying uses the existing idempotency and lease patterns.

Resource deletion remains platform-operator-only under the existing project rule. If exposed for imported resources, it requires a fresh Webdock preview, UID/resourceVersion binding and exact-name confirmation. Tenant selfservice in this delivery does not imply permission to delete a cluster, namespace or persistent data.

## Limits and accounting

BYOK management entitlements are separate from Webdock-hosted compute allowances. Inventory is measurement, not a reservation of provider-owned capacity. Existing external workloads must not suddenly consume or exhaust a tenant's Webdock hosting plan. Show physical capacity, observed requests/limits and optional usage distinctly.

Limits include registered clusters, allowed namespaces and allowed operation types, plus bounded scan/log sizes and request rates. External cluster owners can change their cluster outside Webdock; UI limits cannot be described as hard cluster-wide enforcement. Webdock-created managed applications retain the existing reservation/namespace quota mechanism and verified-capability gate.

## Interface and implementation boundaries

Tenant hosting pages gain Own clusters, registration/enrollment, inventory filters and actionable workload detail pages. Operator customer settings gain BYOK entitlement controls. Existing operator infrastructure continues to show both ownership types explicitly. Reuse current tables, forms, error states and gettext workflow; English source and German catalog translations.

Extend shared hosting contracts, Auth schema/authorization/service, agent protocol, Studio client/actions/routes and scoped MCP tools together. BYOK changes require an additive explicit migration. Keep existing clients/agents working through optional capability-negotiated fields and versioned inventory/action packets. An old agent must not claim unsupported BYOK jobs.

## Hosting UI/UX simplification (explicit owner addition)

The owner also requested that the entire k3s/managed-container interface become easier for platform administrators and customers. Raw bytes and millicores must disappear from ordinary forms and summaries, including existing platform hosting, package limits, customer overrides and the Auth allowance components. This is part of this delivery, not only the new BYOK pages.

### Units and language

Display CPU in cores (e.g. 0.5 / 2), memory/storage in automatically chosen MB/GB/TB, and percentages where there is a known finite denominator. Define these displayed units consistently as decimal units; do not label binary quantities GB. Internal contracts keep exact integer bytes/millicores. Forms offer a numeric value plus visible unit selection. Convert server-side with exact decimal parsing, reject unsupported precision/overflow, and preserve exact stored values when fields are unchanged; rounded displays must never silently lower a saved quota. Localized decimal input and rendering must work in German.

Use plain product terms: Applications, CPU cores, Memory, Persistent storage, Temporary storage, Instances, Available, Allocated, Actual usage, Limit. Explain that allocation is not actual measured CPU/RAM use. Show unavailable metrics as unavailable, not zero. Render Disabled, Unlimited and Not supported explicitly, rather than making the user type the English word unlimited or interpret zero/null. Hide unavailable persistent-storage configuration behind an explanation.

Use one shared formatting/parsing implementation across Studio and Auth. Keep raw values, IDs and technical protocol details in a collapsed technical-details area where useful; secrets remain excluded. Replace container argument JSON editing with individual argument inputs that preserve order and exact strings. Put image digest, writable paths and probe details in Advanced settings, while retaining required validation and showing errors beside relevant fields. No fabricated safe defaults for an unknown application's healthcheck.

### Platform administrator experience

Infrastructure overview: human name, ownership (Webdock/customer), customer, connection/health, node count and available/allocated capacity. Primary action: Connect cluster. Cluster detail begins with health and capacity, followed by Applications, Resources and Settings. Keep enrollment, location evidence and security validation in a guided setup with explicit blockers and next steps, rather than a large simultaneous form.

Customer hosting settings group service mode (managed/selfservice), own-cluster permission, maximum clusters and readable compute limits. Show the effect of a proposed limit and conflicts with current allocations before submission; never silently evict workloads to satisfy a reduced limit. Physical capacity, platform reserve and customer allocation remain distinct.

### Customer experience

Customer hosting starts with applications and their status, then resource allowance and own clusters when enabled. Use clear primary actions: Create application, Connect own cluster, View logs. Hide platform-only controls instead of presenting unusable admin forms. Distinguish observed existing applications from Webdock-managed applications using a short ownership label.

An application's page shows Running/Starting/Stopped/Needs attention, endpoint when actually available, instances, resource allocation and latest operation. Scale/restart/log actions appear with current availability and an explanation when blocked. Operation acceptance shows In progress; only observed success shows Done. Explain actionable errors without dumping raw server errors.

Inventory supports namespace/type/health filters, search and pagination using existing table conventions. Display last scan time, partial/stale status and Refresh. System resources may be inspectable within policy but do not offer unsupported management controls. Mobile layouts must keep names, states and actions usable without requiring wide raw-data tables.

### UX acceptance checks

Check real rendered operator and tenant flows, keyboard labels/focus, error recovery, empty/loading/offline states and German translations. Add focused unit round-trip tests for decimal cores, unit changes, unlimited/disabled, existing non-round values, precision/overflow and localized input. Validate that pre-existing plan/app values remain unchanged on an untouched form submission.

## Verification and delivery

Tests must cover foreign-tenant IDs; member versus admin/owner rights; disabled entitlements; preview denial; enrollment replay; concurrent cluster-limit enforcement; ownership/identity mismatch; revoked generations; policy changes with queued jobs; input/output bounds; partial scans; missing metrics; unhealthy nodes; and preservation of unrelated Kubernetes fields during mutations.

Use disposable local databases and a disposable Kubernetes fixture for an end-to-end tenant flow: operator enables BYOK, tenant enrolls, inventory discovers a pre-existing Deployment, tenant scales/restarts/reads logs, and another tenant cannot access it. Include StatefulSet/DaemonSet/CronJob capability cases and stale UID/version rejection. Do not use customer applications as test fixtures. Existing Contabo connection must continue to heartbeat after any compatible agent update.

Before production deployment, build locally with Node 24 and prebuilt Vercel uploads; verify actual fra1 Functions and rendered tenant/admin pages. Never claim Vercel global infrastructure is EU-only. Any missing live tenant-owned test environment must be reported as a verification gap, not disguised as completion.

## References

- Kubernetes RBAC least privilege: https://kubernetes.io/docs/concepts/security/rbac-good-practices/
- Resource metrics and Metrics Server: https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/
- Current managed hosting contracts: ../../architecture/hosting-control-plane.md
