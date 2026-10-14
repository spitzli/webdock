# Hosting relocation and MCP regression — 2026-10-14

The owner approved including the existing, previously uncommitted project-relocation implementation with the API rewrite. Only its command schema, service, relevant test and necessary placement-lock fixes were copied from the older worktree; that worktree was not modified.

The Gist's exact MCP failure was reproduced after restoring `projects.relocate`: the SDK received an undefined tool name and failed in `validateToolName`. The explicit `relocate_hosting_project` mapping fixes registration. Read-only connections omit it; hosting write permission still cannot bypass the service's current operator/MFA/preview checks.

The real PostgreSQL relocation test reproduced a second issue: an application creation queued behind the shared plan lock retained the source cluster. App mutations and reservations now reread current placement after taking that lock. The relocation itself is an operator handover after a recorded cold restore: it validates fresh observations, zero writers, source stop proof, matching restore checksums, capacity, revisions and idempotency. It preserves resource identity, retained source storage accounting and customer quotas; it does not copy data or start writers.

Validation:18 Hosting/MCP regression tests passed; the real scoped OAuth MCP integration passed8 assertions; API TypeScript passed. No production project was relocated during these tests. Production deployment verification is tracked separately.
