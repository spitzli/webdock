# Managed CMS implementation plan

> **For agentic workers:** Use superpowers:executing-plans or superpowers:subagent-driven-development to implement task-by-task. Preserve disjoint file ownership for parallel implementation.

**Goal:** Install an optional native CMS plugin and automatically provision independent project CMS instances on existing hosting. Production readiness remains conditional on recorded cluster, TLS and matched backup/restore acceptance.

**Architecture:** Generic Core apps/HTTP capabilities mediate an external plugin. Hosting owns approved templates and durable provisioning; a new independent Payload app owns content and media. Reuse the existing native editor.

**Tech stack:** TypeScript, Node 24, Next 16.3.8, Payload 4.0.0-canary.37, Postgres, existing k3s agents.

**Spec:** `docs/superpowers/specs/2026-10-18-cms-plugin-production-design.md`

## Global constraints

- Work only in `/home/newt/.t3/worktrees/webdock/t3code-165bd297`, branch `t3code/cms-plugin-production`.
- Do not resurrect `apps/cms`; do not migrate existing website content or buy infrastructure.
- Keep CMS product code out of Core. Retain data on disable and partial failures.
- Parent owns root package/lock, final integration, commits and deployment; workers do not commit or deploy.
- Use installed Next docs before writing Next code. Never print secrets.

## Review focus

- A role revoked during a long provision must prevent the next external effect.
- Duplicate/ambiguous requests must not allocate a second database or publish twice.
- Media assembled across requests must not escape project/actor scope or overwrite arbitrary files.
- Native Payload endpoints must not bypass projection roles, drafts or CAS policies.
- Media and DB restoration must recover matching content after a real process/volume failure.

### Task 1: Approved template capability and Hosting workflow

**Files:** `packages/plugin-sdk/src/contracts/{apps,capabilities,methods}.ts`, SDK server/tests; `packages/core/src/plugin-apps.ts` and tests; `apps/control-plane/src/modules/{plugins,hosting,auth}` integration; `modules/hosting/src/server/{project-setup,setup-execution,setup-worker}.ts`; contracts, DB migration/RLS and relevant tests.

**Interfaces:** SDK `apps.provision({template_id:string,name:string,request_id:string})` and `apps.provisioningStatus({provisioning_id:string})`; bounded status `{provisioning_id,template_id,state,app_id?,origin?,steps:[{name,state}],reason?}`. Adapter-owned template configuration and persisted provenance. Existing list/get/command remains backward compatible.

- [ ] Add failing schema/dispatcher/adapter tests for capability denial, unapproved template, duplicate request conflict, cross-plugin/project status and missing adapter.
- [ ] Implement generic contracts and optional adapter using existing setup workflow. Persist grant generation, project, verified actor/console identity and setup mapping; enforce background revalidation and RLS.
- [ ] Integrate migration/bootstrap/publication stages with agent execution in Task 3; preserve existing setups.
- [ ] Run SDK/Core tests, Hosting DB integration and revocation/replay acceptance.

### Task 2: Independent CMS image and native editor transport

**Files:** new `apps/cms-instance/**`; `packages/cms-ui/src/{client,types,server}.ts[x]` and focused tests; new Docker target. Parent owns root workspace/lock and shared Docker file integration.

**Interfaces:** explicit runtime config, `/api/health`, public published page/media routes, native `/cms`, trusted `/api/webdock/cms` adapter. `CMSAppProps.transport` injects request transport with existing fetch default; server exposes an authenticated adapter option with trusted identity supplied by verified bridge middleware, never by parsed browser data.

- [ ] Add tests for strict configuration, module allowlist, projection-role intersection, draft/public separation and bridge credential/audience validation.
- [ ] Build independent pages/media/settings template with explicit migration, scoped DB TLS, fixed storage path, protected users and native SSO policies. Apply additive `20261018_201453_managed_media_trash` before serving the new image; retain existing tables and files.
- [ ] Add injected transport while preserving existing consumers and FormData/media behavior; validate content/upload size, filename/MIME and CAS. Keep file replacement immutable and opt reviewed managed media into native `removeToTrash`: administrator removal retains bytes/quota until explicit operator purge, including failed/concurrent metadata writes.
- [ ] Run actual installed Payload initialization/migration and Node 24 production build. Verify read-only-root standalone image with runtime environment.

### Task 3: Migration, publication and persistence adapter

**Files:** `agents/kubernetes/{executor,databases,storage}.py`, new bounded migration/publication helpers, agent tests; Hosting contracts/adapter coordination with Task 1.

**Interfaces:** operator-approved template selects immutable migration image/command, timeout and exact database/volume/origin. Runtime gets DML URL only; job receives migration credentials. Public route only appears after successful initialization and exact-host TLS health checks.

- [ ] Test migrations fail closed, no runtime migration credential, exact owned route, resource quota, no automatic purge and resumable job IDs.
- [ ] Reuse existing restricted manifests, database credentials and Retain PVC; add bounded migration/bootstrap job and publication with UID/generation guards. Issue a per-instance exact-hostname cert-manager Certificate and owned Ingress/TLS Secret; preserve renewal on plugin disable and never copy wildcard key material. Wildcard DNS still routes to the approved ingress.
- [ ] Implement/reuse backup artifact creation and restore verification for instance DB and media without touching existing customer data.
- [ ] Run Python agent suite and real isolated boot/migration/upload/restart/restore tests.

### Task 4: Scoped bridge and external plugin

**Files:** `packages/core/src/plugin-http.ts`, control-plane plugin runtime authority, bounded transfer endpoints/contracts if required; `extensions/managed-cms/**`, Console generic plugin frame only where needed; existing website bridge opt-in.

**Interfaces:** trusted HTTP binding website scope injects fresh actor/role and instance audience. Plugin UI invokes declared actions through signed runtime/MessagePort. Bounded transfer handles JSON up to 1 MiB/media 10 MiB in frames within existing limit, scoped with TTL and integrity.

- [ ] Test cross-site/project denial, revoked grant, untrusted actor headers, malformed/oversized response and incomplete/replayed transfers.
- [ ] Implement bridge authority and per-instance binding registration after successful provisioning. No arbitrary source-manifest credentials.
- [ ] Build plugin create/status/select/editor flow, using Task 1 SDK and Task 2 editor. Show resumable failures and readiness, no fabricated success.
- [ ] Verify existing website integration and new instance end-to-end in preview. The existing serverless website uses PostgreSQL transfer tables after its explicit `cms:migrate`; only the independent single-process instance uses a retained filesystem journal.

### Task 5: Release, documentation and rollout

**Files:** CI image publishing, release manifests, public `docs/guides/**`, `docs/docs.json`, internal dated verification.

- [ ] Review the complete changes; fix authorization, retention, migration and recovery findings before rollout.
- [ ] Run actual production acceptance from the spec, Core build/boundaries, relevant suites and signed-image verification.
- [ ] Publish plugin/CMS images and install reviewed plugin on existing infrastructure; preserve unrelated runtime bindings.
- [ ] Publish selfhosting/backup docs and legible real screenshots, recording exact tested versions and remaining limitations.

## Progress

- Implementation is present for approved provisioning, the independent CMS image, native plugin editor, bounded bridge stores, per-instance cert-manager publication and optional signed release packaging.
- Managed media removal now uses native trash and retains bytes/quota; additive migration `20261018_201453_managed_media_trash` must precede the updated runtime. Existing website transfers use PostgreSQL; managed single-process transfers use retained `/data/transfers`.
- Disposable PostgreSQL 18/TLS and image restart acceptance harnesses exist, and focused local checks are recorded separately. The unchecked acceptance/rollout items above remain gates: local proofs do not establish real cluster TLS issuance, production readiness or a successful matched backup restore. Do not publish/deploy or claim those gates complete from this plan alone.
