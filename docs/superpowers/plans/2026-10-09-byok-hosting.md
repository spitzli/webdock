# BYOK hosting implementation plan

> Execution: native in this session using executing-plans. The owner instructed “jo bau das mal”; preserve existing changes and do not introduce another approval round or commit.

**Goal:** Tenant-owned Kubernetes and Vercel connections with controlled selfservice and usable hosting interfaces.
**Architecture:** Existing Auth authorization/journal and outbound agent; separate tenant ownership and provider credentials. Shared exact resource conversions keep REST contracts stable.
**Stack:** Node 24, Next 16, PostgreSQL, Python stdlib, existing gettext and UI components.
**Spec:** ../specs/2026-10-09-byok-kubernetes-design.md plus the owner's explicit Vercel BYOK addition.

## Global constraints
- No cross-tenant credential/resource access, no preview writes, no tenant deletion.
- Preserve current managed-cluster behavior and exact stored allowances.
- Local disposable database tests only; EU/local prebuilt deployment; no commits.
- Customer Vercel is separate from platform Vercel, provider bills customer; consumption and enforceable limits are distinct.

## Review focus
- Non-round byte values and German decimals survive untouched form submission.
- Tenant permission revocation fences queued operations and OAuth completion.
- A replaced Kubernetes UID/version cannot receive a stale action.
- Missing metrics/partial scans are visibly unavailable, never zero/success.
- OAuth state binds identity/customer; external team/projects cannot cross ownership.

## Execution tasks
- [x] Shared resource formatting and exact decimal conversion, round-trip tests, resource fields in Auth/Studio and readable node/app summaries.
- [x] BYOK policy/ownership, additive migration, customer/member/operator authorization, contracts and command adapters; isolation and concurrency tests.
- [x] Portable agent inventory and guarded existing-workload operations; UID/version fencing, partial-result handling and Python tests.
- [x] Customer Kubernetes registration/enrollment/inventory/action UI; API/MCP parity and operation feedback.
- [x] Vercel tenant OAuth and encrypted connections, selected project inventory/actions, ownership and callback tests; provider availability/permissions reflected in UI.
- [x] Cohesive operator/customer navigation, plain labels, responsive resource summaries, advanced details, gettext extraction/translation/compile.
- [x] Local end-to-end verification, suites/typechecks/build, documented provider/environment limitations, then authorized live rollout where credentials/session permit.

Each nontrivial change starts with a focused failing behavior test. Run its test, implement the smallest connected change, then run its suite. Update this checklist with actual outcomes, never infer live success from a build.

## Outcome and rulings

All implementation tasks delivered and deployed; real customer Vercel OAuth remains the explicit external verification gap. Native code review findings were fixed and re-reviewed. Live provider project creation/builds were not used as tests. Vercel integration credentials remain in Studio runtime and cross only the authenticated internal channel for begin/finish. Ruling: revoked registration archive UI is deferred; records retain their quota count and no external resources are deleted. Full-suite tests run sequentially because the existing Studio test setup truncates shared local disposable tables. No production tests reset data. Documentation and source remain uncommitted.
