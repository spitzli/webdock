# Studio workspaces: implementation and verification

The owner approved implementation of the navigation and task-focused UI plan in the conversation on 2026-10-12. This file records that scope and execution; production deployment is separate.

## Outcome

Operators find projects, customers and operations directly. Customer workspaces lead with available work. Hosting, builds and applications retain their authorized customer/project context on direct navigation. Configuration is separated from day-to-day work without changing permissions or losing existing actions and links.

## Constraints

- Reuse customer IDs, project IDs, sessions, delegation, revision checks, action handlers and deletion previews. No automatic relationship inference or data migration.
- Keep current URLs and deep links. The operator registry must never become accessible to customer accounts.
- Read-only preview remains visibly marked and server-enforced, including after expiration.
- Reuse the existing CMS design, themes, tokens and German/English gettext catalogs.
- Preserve content drafts, save conflicts and explicit publication semantics.
- Mail follows `docs/architecture/mail-deployment-decision.md`: outgoing-only requires no incoming activation; suspension retains data.
- State means observed state, not a promise of availability. Missing measurements never become zero.
- Use the existing isolated worktree. Validate only against disposable local test data; no production writes.

## Tasks

1. Establish baseline and add tested navigation/context contracts. Add authorized project context reads and bounded operator operations reads using existing delegation.
2. Implement shared context breadcrumbs and responsive area navigation; group operator navigation, account controls and customer workspace navigation. Keep all current route families recognized.
3. Lead customer and project pages with tasks and related resources; separate profile/team views, retain invitation and access behavior, skip a sole-workspace chooser only when no invitations are pending.
4. Split application overview/logs/settings and Git activity/setup; preserve action state, revision guards, errors and retained-storage recovery. Add direct project hosting access and clear resource measurements.
5. Simplify website overview, mobile module navigation, content publication wording, reliable content grouping metadata and calendar booking/configuration views. Preserve editor state and demo labels.
6. Group people, Mail, database and usage tasks. Add a connections directory with explicit ownership and links to existing administration. Keep existing provider actions.
7. Add operator operations page with bounded server reads of actual applications and operations, no per-project request fan-out. Include source timestamp and empty/error states.
8. Complete German translations; run affected integration tests, type checks, lint, builds and local browser checks. Obtain a fresh code review and resolve material findings.

## Acceptance

- Project → applications, customer → team, project → deployment → build work directly.
- Every hosting detail has authorized customer/project names and a stable back path, including reload/deep links.
- Existing account, invitation, offer, deletion, external CMS and preview paths remain reachable.
- Customer roles and foreign-tenant attempts retain backend denials; no secrets enter presentation contracts.
- Application/configuration and content drafts survive intended navigation or warn before losing changes.
- All module destinations remain reachable at 320/375/414/768 px and with keyboard navigation.
- Status, publication, preview and simulated commerce labels are accurate.

## Progress

- Baseline: clean `t3code/ui-ux-inventory`, commit `4ee759c`; 50 Studio pages. Existing local test environment copied only after checking localhost and disposable database name. Node 24 selected for verification.
- Deployment SHA reconciliation remains a release-time read-only check; local implementation is based on the current branch. Production was not changed.
- Implemented shared route selection, responsive area navigation, authorized project/website context, customer landing/profile/team separation, application overview/logs/settings, Git activity/setup, Mail subareas, usage views, people views and Operations.
- Existing local database credentials did not match the running database. Created an isolated PostgreSQL container, restored only a local fixture schema, and initialized Snowflake/defaults. Test database and browser fixture database are separate; no existing database was changed.
- Review: independent reviewer found missing dirty tracking for button-driven environment edits and missing operation context. Both were fixed; the dirty-state regression test was observed failing before the fix and passing afterward. The duplicate appointment disclosure was removed.
- Ruling: existing bridge fields without reliable section metadata remain a complete searchable list; grouping activates only for explicit validated metadata. This avoids silently misclassifying customer content.
- Ruling: preserve existing URLs and action handlers; the older operator hosting URL redirects with its supported query parameters to the shared customer hosting view. No data migration or provider provisioning accompanies the UI change.
- Release order: deploy the additive Auth read contracts before Studio. The production deployment/source-SHA check remains part of release, not local implementation.
- Verification complete: Studio 113/113, Auth 142/142; both type checks, lint and production builds passed. Local browser evidence and boundaries are in `docs/verification/2026-10-12-studio-workspaces.md`.
