# Studio workspace verification

Local implementation on `t3code/ui-ux-inventory`, based on `4ee759c`. Production was not modified or deployed.

## Automated checks

- Studio: 113 tests passed, including route/query selection, single-workspace/invitation behavior, explicit content metadata validation, and real React interaction coverage for environment/argument removals engaging the dirty guard.
- Auth: 142 tests passed, including the new project-context and operator-overview authorization checks, preview denial, omission of specs/logs/secrets from overview responses, and website-to-customer mapping through authorized site claims.
- Studio and Auth TypeScript checks and ESLint passed. Both production builds passed (exit 0). The Studio compilation disabled the local HTTP SSO fixture via process environment; real local SSO was exercised separately in development, and production SSO configuration was not changed.
- GNU gettext catalogs were compiled, including German workspace/action labels. Stored enums, customer-authored names and form values remain untranslated.

## Browser evidence

Used the T3 collaborative browser against local Studio and Auth, with a dedicated disposable PostgreSQL browser database. Real signed test sessions, OAuth/PKCE, delegation, server components and database reads were used. The initial operator session was attached from the local fixture; customer identities signed in through the real local auth endpoint.

- Operator project, customer, workspace, team, Mail overview/domains/settings, usage plan/sources, Git, people and Operations routes exercised.
- Direct application URLs show the authorized customer/project trail and active main area. Overview, logs and settings are separate; log output comes from the disposable application fixture.
- A customer administrator with a single active workspace lands directly in that workspace. A normal member sees no application mutation buttons or settings navigation. Website-reader navigation omits orders and shop customers.
- Read-only customer preview enters with the visible banner and retains its return action; preview was ended after checking it.
- Removing an existing fixture environment variable and clicking Logs invokes the localized unsaved-change prompt. Cancelling preserves the settings route and the removal draft. Accepting allows navigation.
- Application overview and the opened website module menu checked at 320, 375, 414 and 768 px. All module destinations were visible, including orders/shop customers for the operator. No visible controls extended beyond the viewport and no page-level horizontal overflow was found.
- Application overview inspected at 1280×800 in both dark and light themes.
- Mobile area navigation also checked with the keyboard: Enter opens all destinations, Escape closes the list and restores focus to its summary.
- Operation detail checked with a journal fixture: project/customer relationship and a return route are present. A separate log-request attempt correctly rejected a fixture without the required environment-capable agent; no real workload was deployed.

Screenshots remain local artifacts:

- Dark application: `/home/newt/.t3/userdata/browser-artifacts/browser-screenshot-127-0-0-1-mv5f3rq8-39ec757f.png`
- Light application: `/home/newt/.t3/userdata/browser-artifacts/browser-screenshot-127-0-0-1-mv5f3rwn-83c03d4c.png`
- Mobile website: `/home/newt/.t3/userdata/browser-artifacts/browser-screenshot-127-0-0-1-mv5empv0-077e60ad.png` (captured before the final action-label translation).

## Boundaries and release

This is not a live delivery, SMTP/Webmail, payment or Kubernetes deployment test. No real invitations, payments, provisioning or deletions were performed. Website content/calendar/shop endpoints were not replaced by fake production integrations. Their existing tests and boundaries remain; the browser fixture verifies workspace/module navigation without claiming end-to-end writes to a real website.

Old content bridges without explicit section metadata still expose the full field list. This implementation does not invent page membership for numeric content keys.

Deploy Auth first for the additive `projects.get`/`operations.overview` reads, then Studio. Reconcile the current production source SHA at release time and repeat smoke checks with production roles. No schema migration is needed for these new reads.
