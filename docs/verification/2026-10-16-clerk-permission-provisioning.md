# Clerk organization permission provisioning

The provisioner is `apps/api/scripts/configure-clerk-permissions.ts`. It uses the
already authenticated Clerk CLI through `npx -y clerk@latest`; it does not read or
print secret keys. Run Bun with `--no-env-file`. No package dependencies were added.

## Target and preview

```sh
bun --no-env-file apps/api/scripts/configure-clerk-permissions.ts \
  --environment dev \
  --app app_3KjGKUGb7dYUMgkjKC0eCWghnOB \
  --instance ins_3KjGKQnAATh2cA4ddJBR2cg3NXu
```

The default is read-only. Review its `actions`, then repeat with `--apply`.
Production uses `--environment prod --instance ins_3Klz8x6R4XYa8w6QfjPQl95EKZf` and
the same application. Configure permissions before deploying permission-dependent
API/SQL enforcement. Production apply must be coordinated with the release owner.

The script checks the exact configured app/instance/environment against the live
Platform API response before reading or changing the Backend API. It paginates
roles, permissions, role sets, organizations and memberships. It creates only the
four central Webdock permission keys and uses additive attachment to the existing
`org:admin`. It never replaces a role, role set, permission collection or membership.
Every mutating CLI invocation first performs its CLI `--dry-run` preview.

An unexpected Webdock grant on Member or another role stops the operation for
manual review; the script does not revoke it automatically. Missing Admin/Member,
a role set without them, an active role-set migration, or inconsistent provider
responses also stop the operation. Preserve legitimate future customized role
policy by reviewing the provisioner before reusing it after such a policy change.

Apply rereads roles, checks retention of all previous permissions, unchanged
non-Admin roles, all four Admin grants, and `permissions` on every current live
membership. No membership/user/invitation writes occur. `verifiedMemberships: 0`
means no memberships were checked (always the case in dry-run); it is not proof of
an authenticated customer journey. Rerunning apply when already configured has no
mutations and performs the same readback.

## Endpoint discovery and observed result, 2026-10-16

Discovered using `clerk api ls permission`, `clerk api ls role`, and the live API:

- `GET/POST /organization_permissions` returns/creates permission objects with
  `id`, `key`, `name`, `description`, `type`.
- `GET /organization_roles` returns roles with nested permission objects.
- `POST /organization_roles/{organization_role_id}/permissions/{permission_id}`
  adds one permission; `{}` is accepted as the request body.
- `GET /role_sets` returns the roles assigned to each role set plus migration
  state; no role-set replacement is needed for an additive role permission.
- `GET /platform/applications/{applicationID}` returns `application_id` and
  `instances[].instance_id` / `environment_type` for identity verification.
- `GET /organizations/{id}/memberships` returns effective permission key arrays.

Development apply succeeded: all four custom permissions are assigned to existing
Admin, its ten native system permissions remain, Member retains only its two
native read permissions. All four current development memberships passed the live
permission readback. Creation and assignment succeeded without purchasing a plan,
creating paid roles, or activating Clerk Billing. This proves capability on this
development instance; production plan enforcement is not inferred from it.

Production read-only preview succeeded and reported four creates plus four Admin
attachments. Production Admin currently has ten system permissions and Member two;
production has not been changed by this initial verification.

Fake-provider tests cover dry-run, additive preservation, repeat apply, target and
live-identity mismatch, and unexpected Member grants without automatic revocation:

```sh
bun --no-env-file test apps/api/tests/clerk-permission-provisioning.test.ts
```

Result: 4 passed, 0 failed (13 assertions).

## Production additive apply

Production apply completed on 2026-10-16: four permission objects created and
attached to the existing Admin role. All three current production memberships
passed effective-permission readback. Existing native Admin/Member permissions
were retained; no roles, memberships, invitations or Billing features were created.
The running application is unchanged until the coordinated application/policy rollout.
