# Hosting UI and shared Console shell

The existing Hosting presentation is owned by `modules/hosting/src/ui`: application/environment fields, infrastructure and customer views, resource tables, enrollment credentials, service bindings, setup source/service/review/progress flows, mailbox-connection setup and project navigation presentation. Database order/plan/credential panels and tenant database navigation now belong to `modules/databases/src/ui`; their existing Console Hosting-path imports remain compatibility wrappers. These are the real existing components and hooks, with their CSS classes, form fields, accessibility labels and public paths preserved.

Console compatibility files now contain composition, not a second UI implementation. Next `use server` functions remain in Console's existing action files. Their public state types live in `module-hosting/ui-types`; action implementations still perform authenticated API calls and revalidation. An app-only client boundary supplies those real Server Functions as typed action props to a module React provider. There is no module-global service locator, provider SDK or direct API credential access.

Server view factories receive only their named data/read and shell ports. Console supplies authenticated page calls, operator project choices, cached project context, optional Mail forms and the existing AreaNavigation renderer. The ProjectApplications wrapper retains its early installation-state check before any Hosting data request. Registry-backed project choices remain fetched through the current authenticated Console boundary. The module imports neither `@/` application aliases nor application/server service code.

## Shared shell

`packages/console-kit` owns Console icons, link-pending indication, workspace breadcrumbs, list controls/query helpers and the unsaved-change hook. Existing Console paths reexport these implementations. Parent-owned AreaNavigation remains in Console, including its `useModuleView` product filtering; Hosting receives it as a renderer. This keeps navigation policy in composition without copying icons or accessibility behavior into products.

## State isolation

Stateful Hosting forms and app boundaries are keyed by customer, project, application, database, connection/domain, cluster, enrollment and setup identity. The neutral key helper lives in console-kit and deliberately excludes credentials, idempotency keys and revisions. Changing resources remounts private action results and draft state; a normal same-resource refresh preserves pending/unsaved work. Database credential and enrollment panels cannot retain a previous resource's displayed secret after a scope change. Nested service-binding forms and Mail setup subtrees receive the same scope handling.

Existing dirty-field contexts, successful-save resets, revision handling, pending disablement, consent checkboxes, environment resets and idempotency behavior remain in the moved components. Action ports are required: rendering an action-capable module component without host composition fails rather than silently issuing an unscoped call.

## Verification

`modules/hosting/tests/ui-boundary.test.tsx` verifies resource-key semantics and the absence of application/server imports from Hosting UI and console-kit. The moved database credential isolation regression lives in `modules/databases/tests/ui-boundary.test.tsx`. Existing Console setup-render, dirty-field, sidebar, list-query and i18n tests continue through compatibility imports. Frontend dependency tests verify that server credentials and Clerk verification code remain unreachable from client components.

No route, authorization rule, provider endpoint or deployment changes as part of this UI extraction. Rendering and typechecks do not replace the existing authenticated backend/RLS tests or a production browser rollout.
