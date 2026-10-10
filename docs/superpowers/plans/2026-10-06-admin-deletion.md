# Admin-only project deletion implementation plan

Goal: remove the requested Gristeder Hof demo and lead through Webdock interfaces, never a standalone infrastructure/SQL deletion script. UI, REST and MCP must share one platform-operator-only implementation. Customers/tenant admins/read-only MCP clients cannot delete. Existing user authorization covers this target; no other project is authorized for deletion.

Architecture: scoped project deletion service with a read-only deletion preview and explicit confirmation of the current project name. It validates existing registry, hosting, isolated database and identity mappings before external changes, journals progress for safe recovery, and removes inventory only after external deletion is confirmed. Generic empty registry-record removal can share authorization; unsupported/shared resources fail closed. Local-only lead tracker remains local and uses its own API after remote deletion succeeds. No cloud access to laptop paths or blanket admin database credentials.

- [x] Implement/test Vercel project deletion adapter with team/id validation and explicit permission errors; preserve optional read-only integrations.
- [x] Implement/test operator-authenticated identity binding removal API, rejecting Studio/control-plane bindings, wrong customer/origin, active tenant preview, and read-only tokens. No deletion of user accounts.
- [x] Implement deletion preview/orchestrator, persisted progress, isolated-resource checks, UI/REST/MCP entry points; tests for roles, changed mappings, partial failures and repeated requests.
- [ ] Validate builds and tests, deploy needed services, invoke the requested deletion through Webdock only if full authorization/configuration is available. Otherwise report exact capability blocker without bypassing it.
- [ ] Remove WD-045 via local lead API, active seeds/manifests and unsubmitted mail draft only after successful remote deletion. Preserve historical audit evidence; update README/AGENTS and verify other leads untouched.

Constraints: Node24/Next16, existing dirty worktree preserved, no commits, use T3 collaborative browser only, EN default/gettext DE, no secrets in output, no real emails, no other business resources deleted. Role `operator` denotes platform superadmin; tenant `admin` is insufficient. Do not reuse user's expired shutdown instruction.

Review results: fixed shared hosting through vercel_project_link, metadata-edit recovery, exact-name race and renamed retry idempotency. Runtime database inspection passed for Gristeder without deletion. Auth deployed as dpl_GoRwze2mHC1MRnxfWQgVN7PTSTf7. Studio deployment and live UI verification in progress. Existing Webdock Vercel integration reports missing target project access and is historically read-only; no target deletion has occurred.

Final deployment: Studio dpl_HeLdUD3Q4jDaSDVfYpzStMFpiXTr, Auth dpl_GoRwze2mHC1MRnxfWQgVN7PTSTf7. Live unauthorized endpoints reject401; authenticated German deletepage shows exactmissingVercelgrant. Private integration definition now uses actual `read-write:project` replacing `read:project`; OAuth callback verified by regressiontests for both alternatives. Reconnection popup remains uncompleted; no target deletion performed. User normal-browser completion required before executing target deletion. See root verification JSON.
