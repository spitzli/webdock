# Hosting relocation and MCP regression — 2026-10-14

The owner approved including the existing, previously uncommitted project-relocation implementation with the API rewrite. Only its command schema, service, relevant test and necessary placement-lock fixes were copied from the older worktree; that worktree was not modified.

The Gist's exact MCP failure was reproduced after restoring `projects.relocate`: the SDK received an undefined tool name and failed in `validateToolName`. The explicit `relocate_hosting_project` mapping fixes registration. Read-only connections omit it; hosting write permission still cannot bypass the service's current operator/MFA/preview checks.

The real PostgreSQL relocation test reproduced a second issue: an application creation queued behind the shared plan lock retained the source cluster. App mutations and reservations now reread current placement after taking that lock. The relocation itself is an operator handover after a recorded cold restore: it validates fresh observations, zero writers, source stop proof, matching restore checksums, capacity, revisions and idempotency. It preserves resource identity, retained source storage accounting and customer quotas; it does not copy data or start writers.

Validation:18 Hosting/MCP regression tests passed; the real scoped OAuth MCP integration passed8 assertions; API TypeScript passed. No production project was relocated during these tests. Production deployment verification is tracked separately.

Deployment preflight also found two existing operator-only dashboard clients in the production database. The API now retains their explicit subject allowlist, interactive OpenID-only issuance and current-session/MFA checks, including opaque-token introspection. The imported wire-flow regression failed before the guard and passed16 tests afterward. Existing dashboard clients/secrets were not recreated.

The first Vercel preview caught a shared SSO return-type regression for independent Payload CMS applications: API-owned string-ID mappings widened the Payload strategy result. Native Payload lookup and API lookup now remain distinct, preserving each instance's ID type. The15 shared SSO tests and both Web/CMS typechecks pass; API mappings cannot be used as a Payload auth strategy. No ID conversion or typecheck suppression was introduced.
