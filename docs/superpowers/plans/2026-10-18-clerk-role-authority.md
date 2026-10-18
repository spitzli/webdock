# Clerk owns roles when selected

User request: default local Better Auth remains selectable; when Clerk is selected, roles and memberships must be managed in Clerk too. Implement now, autonomously. Preserve existing dirty changes and published app work. No production role grants, provider switch or broad rollout.

## Decisions
- Better Auth mode: local role/membership authority remains unchanged.
- Clerk mode: fresh Backend User.privateMetadata.webdockRole === 'operator' is the only global operator grant; missing/unknown values mean ordinary user. Never trust unsafeMetadata, client input, or stale local operator columns.
- Workspace membership and fine-grained rights come from live Clerk organization memberships and their permissions. Support custom org:* role keys; only org:admin projects to legacy admin, other valid custom roles project to member while retaining their explicit permission grants. No global operator escalation from org admin.
- Local IDs and organization/customer mappings are stable routing/provenance. Mapping disable/local bans/customer inactive remain deny-only protections, not grants.
- Enforce same authority in native Console, callback/worker revalidation, compatibility adapter and signed database scopes/RLS. No legacy fallback for selected Clerk where an authoritative mapping is missing.
- Preserve MFA/session/issuer checks. Provider outage fails closed. No email auto-linking.

## Tasks
1. Native Console verifier/provider/principal changes + custom-role tests.
2. Trusted Clerk adapter SDK and compatibility authority changes; remove local membership fallback, keeping Better Auth untouched.
3. Database proof/RLS checks use current Clerk authority instead of user.role; add real PostgreSQL revocation/forged proof tests.
4. Audit admin/team UI and remaining local role gates; correct docs and dev test tooling. Verify typechecks, regression, owned development Clerk acceptance if available, then independent security review.

Global operator role is an application-specific Clerk metadata field, not an organization role. Auth plugins remain trusted startup-selected server packages; changing provider requires coordinated restart, no live hot swap.
