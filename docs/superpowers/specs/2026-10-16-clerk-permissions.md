# Clerk organization permissions

The owner requested that Clerk become the central source of organization-wide
permissions. Implement the four discussed capabilities on existing Admin/Member
roles, preserving current access at rollout:

| Permission | Admin | Member | Scope |
|---|---|---|---|
| org:projects:manage | yes | no | Existing customer-manageable self-service project/application configuration |
| org:deployments:create | yes | no | Customer Git build/publication/retry/rollback actions |
| org:databases:manage | yes | no | Existing customer database management, grants and admin-only viewer capabilities |
| org:billing:manage | yes | no | Existing customer billing administration |

No new roles, paid features, Clerk Billing activation or expanded default access.
Platform operator authority remains an explicit Webdock role, outside customer
organizations. Existing operator-only provisioning, managed-vs-self-service checks,
customer/user suspension, read-only preview, project relationships and explicit
website/database/mailbox grants remain mandatory. Membership/team administration
continues to use Clerk native system rules. Mail administration and customer profile
rules are not remapped into unrelated project permissions in this increment.

Read permission keys from the current Backend API membership, not role-name
inference or stale browser JWT permissions. Only allowlisted keys enter the bounded
signed SQL proof. Missing permissions deny capability even for org:admin. Linked
legacy clients use the same live permission proof; unmigrated legacy tenants retain
existing role behavior. Worker/viewer revalidation must carry current permissions.

Apply permissions at service authorization and relevant SQL policy boundaries.
A permission granted intentionally to Member can authorize that domain, but cannot
become a blanket admin role or grant an unrelated domain. Preserve resource-level
restrictions. Shared operation/audit tables may admit the union of relevant domain
capabilities; their resource tables still enforce the specific capability.

Keep existing customer read access. UI management capabilities come from server
responses reflecting the same live permissions; no client-side role override.
Provision the four keys idempotently and attach only to existing Admin, preserving
all existing System Permissions and unrelated custom permissions. Verify both
instances independently; configure permissions before activating code/policies.
