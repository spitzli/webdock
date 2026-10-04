# Customer tenants and invitation-only access

Requested outcome: create customers with personal/company/contact/address data, provision their tenant, invite them to set up an account, and scope customer access to tenant membership. Mail/turboSMTP subaccounts and sender domains follow this task.

1. Extend existing Studio customers rather than introduce another customer registry. Flat public profile fields plus existing private operator notes; validation applies equally to UI/API/MCP. Add explicit Payload migration and typed form fields.
2. Map each customer to one Better Auth organization in `webdock_auth.tenant_customer`. Existing Spitzli and Stall organizations are mapped explicitly, preserving memberships and CMS bindings. A narrowly defined PostgreSQL trigger provisions new organizations atomically with customer creation and synchronizes their display name.
3. Keep the Studio runtime isolated from auth tables. Auth receives only named public customer column permissions, never operator notes. No owner database credentials in deployments. The bridge migration is an offline owner operation.
4. Add central `/tenants` and `/tenants/[customerID]` views. Every read/write verifies current verified account, status and membership. Operators manage all; customer owner/admin may maintain tenant profile and invite members/admins; ordinary members view. No platform-role elevation, no automatic CMS grant from tenant administration.
5. Reuse existing secure password-setup, email verification and invitation acceptance. Invitation-only signup remains enforced. Guard native organization endpoints as well as custom UI, prevent cross-tenant access and last-administrator removal. Keep audit events.
6. Validate with disposable two-tenant integration tests, permission-grant tests, full auth/admin suites, type/lint/build and mobile UI. Deploy migrations before code. Verify existing production tenant mapping and operator pages without sending real customer invitations.

Review focus: guessed customer IDs; pending/expired/cancelled invitation; archived tenant or suspended account; role changes through native APIs; private notes accidentally selected; preserving existing CMS access; migration rerun creating duplicate organizations.
