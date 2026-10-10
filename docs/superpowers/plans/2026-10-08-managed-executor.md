# Active managed hosting execution

The user corrected the read-only stopping point: full managed hosting is required. Continue the approved architecture with active lifecycle control. Studio/Auth remain at Vercel by the user's previous choice; develop and verify actual cluster writes through the local Webdock control plane without silently enabling unverified production routes.

## Binding contracts

- Every mutation starts in the Webdock authenticated service; UI, REST and MCP share it. Agent receives typed desired application state, never arbitrary commands/manifests.
- The existing Contabo admission/namespace baseline is authoritative. Do not rerun its fixed-quota bootstrap over customer allocations. Managed namespaces have immutable project/cluster ownership and platform-calculated quota.
- One application revision/operation per project is active. Global customer, provider, project and cluster reservations include updates and replica changes. Stopped apps retain app/volume allocations. Deletion requires operator role, exact name and a current plan hash; only release allocation after observed absence.
- Uncertain execution retains reservations and prevents overlapping changes. Agent commands/results bind cluster, operation, revision and lease. Revocation prevents new claims.
- No provider deployments, migrations of customer applications or unrelated resources. Verify with a clearly marked managed test application and remove it through the same Webdock deletion service.

## Ordered delivery

1. Add strict app specification, app CRUD/lifecycle command schemas and cluster activation with explicit verified capacity. Version app spec and desired/observed state in additive tables. Write contract and transactional integration tests.
2. Add a typed remote executor that creates/validates owned namespaces, project quotas, Pod Security and default-deny networks; server-side dry-run the exact Pod as well as workload before applying. Apply Recreate deployments to avoid hidden surge allocation, require positive resources/read-only filesystem/probes/no tokens. Fixed requests only; no shell from customers.
3. Complete the operation protocol: claim desired state, bounded lease renewal, result proof and reconciliation. Agent returns object UID/generation and ready status; unsuccessful/ambiguous writes retain budget. Queries/logs read only owned app resources with byte/line limits.
4. Expose create/update/start/stop/scale/restart/rollback, status/logs and deletion preview/delete in Studio, REST and MCP. Customer selfservice obeys project mode and image policy; operator manages all.
5. Run local disposable tests and actual T3 browser flow. Enable the real Contabo cluster only with explicit capacity reserves and the tested application profile. Use an already present immutable image for verification, avoiding new non-EU builds/registry pulls. Delete the smoke app through Webdock and verify absence and released allocation.

This is execution of the user's explicit full-managed correction, not another approval checkpoint. No remote server maintenance/OS upgrade or control-plane migration is implied.

## Execution result

Active lifecycle implemented and verified on the real node through Webdock UI/API and the shared MCP service contracts. Nine live operations succeeded, including create/scale/stop/start/restart/rollback/logs, a UI configuration update, and UI-confirmed deletion. Internal HTTP returned OK before cleanup. App resources are absent, project app quotas are zero, and reservations are released; managed empty namespaces are retained. The local bridge now runs with --manage. Production Studio/Auth remain unchanged.

Verification: Auth 78, Admin 91, contracts 4, Python 6 and i18n 11 tests passed; both typechecks and diff checks passed. Failure recovery, read-only preview job denial, selfservice image permissions, diagnostics after failed rollout, Unicode log bounds and idempotent app creation have regression coverage. No independent reviewer or production deployment is claimed. Cached HTTP images and temporary storage are the supported profile; see the architecture document for remaining product capabilities.
