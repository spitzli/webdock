# Core platform: plans, limits, usage and the rest of Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Core knows what each customer may use, measures what they do use and shows both openly;
plugins get verified domains, notifications and API access from Core instead of each building
their own. Billing is a later plugin (`docs/plugin-ideas.md`); Core holds no prices.

**Architecture:** Limits are enforced where Core already stands between plugins and the cluster:
at action admission (resource counts), at workload pinning (memory, CPU, storage) and in the
database (projects). Measurement comes from the cluster's agent (metrics API) into hourly samples.
Console reads one usage view per customer.

**Tech stack:** Rust (plugin-host, agent, control-plane), PostgreSQL with RLS, React console-ui,
Kubernetes metrics API (metrics-server).

## Global constraints

- No production data in tests; disposable local PostgreSQL / k3s only. No real mail.
- No secrets or full database URLs in files, logs or commits. EU region for anything operated.
- Shadow mode: no backward compatibility, migrations may reshape freely.
- No deep relative imports; `@`/`$` aliases. Bun only.

## Phase A: plans, limits and usage

### Meters

| Meter | Unit | Source |
|---|---|---|
| `projects` | count | `webdock_admin.projects` per customer |
| `memory` | MiB | pinned workloads: container memory limit × replicas; CNPG `Cluster` resources × instances |
| `cpu` | millicores | pinned workloads: container CPU request × replicas; CNPG likewise |
| `storage` | MiB | PVCs, StatefulSet claim templates × replicas, CNPG `storage.size` × instances |
| `<plugin>.<offering>` | count | `plugin_resource` rows of that offering |

Measured (not limited): current CPU and memory per unit from the metrics API, sampled hourly.

### Rulings

- A plan is a named set of limits (`{meter: integer}`); a missing key is unlimited. Each customer
  has at most one assigned plan plus per-meter overrides (an override of `null` lifts the limit).
  Customers without an assignment fall under the plan marked default; with no default plan,
  nothing is limited. Cost if wrong: a fresh installation without a default plan lets self-service
  customers allocate freely until an operator creates one.
- Limits bind operators too: an operator who wants more for a customer raises the plan or an
  override. Cost if wrong: an operator action is refused where they expected to bypass.
- Every container of a pinned workload must state a memory limit and a CPU request; otherwise
  Core refuses it. Cost if wrong: plugins that relied on defaults must set them.
- A change that does not grow a meter is always allowed, even when the customer is already over
  (e.g. after a plan downgrade): stop, shrink and delete keep working.
- Workload checks run under a per-customer advisory lock in the pin transaction. Count checks run
  at admission without a lock: two concurrent creates can end one over the limit. Cost if wrong:
  one extra resource; the usage view shows it as over.
- The default project is created even when `projects` is 0.
- Units may name the resource they belong to (`resource` in `apply`), so usage shows names. Core
  only shows a name when that resource is in the same project and plugin.
- Local dev k3s gets metrics-server (chart, insecure kubelet TLS, dev only).

### Tasks

1. **Schema** (`crates/plugin-host/migrations/0006_limits.sql`, persistence 0030): `plan`,
   `customer_plan`, `plugin_workload.allocation`/`resource_id`, `workload_usage` hourly samples,
   functions `webdock_rls.customer_limits(customer)`, `webdock_rls.customer_usage(customer)`,
   projects insert trigger. RLS: operators manage plans; customers read their own plan and usage.
2. **Allocation** (`crates/plugin-host/src/workloads.rs`): `allocation(objects) -> Allocation`
   and the memory/CPU requirement in `pin()`; unit tests for Deployment, StatefulSet, PVC, CNPG.
3. **Enforcement**: workload apply checks growth against limits under the customer lock; gate
   checks offering counts on `resource: create`. PostgreSQL integration tests in plugin-host.
4. **Measurement**: agent reads `metrics.k8s.io` PodMetrics for each unit and reports
   `usage {cpu, memory}` in the observation; Core folds reports into hourly samples (35 days).
5. **API** (`crates/control-plane`): operator plans CRUD, customer plan assignment and overrides,
   customer usage view (limits, allocated, measured, per-project and per-resource breakdown,
   hourly history).
6. **Console**: operator Plans page, plan and overrides on the customer page, a "Plan and usage"
   page in each workspace with bars against limits, a breakdown per resource and a 7-day chart.
7. **Plugins**: hosting sets a CPU limit and readiness probe; mail and postgres already state
   memory and CPU.

### Status (2026-10-22)

Done: schema (`0030_limits`), allocation in `pin()`, limits at admission and apply, the projects
trigger, agent measurement with dev metrics-server, operator and customer API, console pages
(Plans, plan and limits on the customer page, Plan and usage per workspace), hosting CPU and
readiness. Ruling: units applied before this migration count once their plugin applies them again.
Cost if wrong: such a unit shows 0 reserved until then. Ruling: the dev k3s node is named
`webdock-dev`, so recreating the container keeps pods and local volumes.

## Phase B: route hosts and own domains

- Core pins `IngressRoute`/`IngressRouteTCP` hosts and `Certificate` dnsNames to the plugin's
  configured domain or to a domain the customer verified.
- Verified domains are a Core record per customer (TXT challenge, re-checked); plugins ask Core
  whether a host is usable. Production ACME ClusterIssuer (HTTP-01) for verified hosts.
- Hosting: add and remove own domains per app.

### Status (2026-10-22)

Done: `customer_domain` with TXT tokens (`0031_customer_domains`), host extraction for IngressRoute,
IngressRouteTCP, Ingress and Certificate in `pin()`, route domains per runtime binding, the
`webdock_rls.project_unverified_host` check, the customer API and Domains page, own domains in
hosting, `deploy/cluster` with the ACME issuer. Customer-facing plugin and host errors (invalid input,
conflict, not found) now cross process boundaries as one sanitised line; other errors keep fixed texts.
Ruling: Traefik rules must start with their host matchers and may only narrow afterwards (`&&`, no
`||`). Cost if wrong: a plugin with an unusual rule shape must rewrite it. Ruling: in development,
`.localhost` domains verify without DNS. Ruling: verification is checked once; re-checking ownership
later is open. Cost if wrong: a domain that changes hands stays usable by the first customer.

## Phase C: API access

- Customers create scoped API tokens for a workspace, listed and revocable in the console. Plugin
  actions accept them.

### Status (2026-10-22)

Done: `api_token` (`0032_api_tokens`), the `/v1/api` surface (projects, plugins, actions, usage), the
console page and `docs/workspace-api.md`. Ruling: a token is its own session of the member who made
it instead of an OAuth client, so RLS, roles and admission apply unchanged and the token loses access
with its member. Cost if wrong: tokens show up as sessions of that member, and "sign out everywhere"
also ends them. Ruling: no CLI yet; curl against the documented API covers CI.

## Phase D: notifications

- Core events (deploy failed, crash loop, certificate not ready) go to the workspace's owners and
  admins by mail (dev: Mailpit only), deduplicated, and show in the console.

### Status (2026-10-22)

Done: `notification` (`0033_notifications`) opened and resolved from each agent report of the current
revision (crashing, image, refused, certificate), the mail loop with a fixed text and a sign-in link,
the console section on the workspace overview. Ruling: notices count only after 2 minutes
(certificates 15), in mail and console alike. Ruling: no webhooks yet; they need an outbound guard
against internal addresses first. Ruling: plan limits are not notified; the refusal already tells the
person who hit it. Cost if wrong: an owner learns of a limit only when someone hits it.

## Phase E: log history

- The agent ships unit logs beyond the last 100 lines into a bounded store per unit (days, not
  months), searchable from the console.

## Phase F: placement

- Projects choose a cluster from the clusters an operator allows; workloads follow the project.
