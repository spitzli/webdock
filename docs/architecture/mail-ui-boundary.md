# Mail UI composition boundary

Source checkpoint: 2026-10-15. Existing presentation is extracted without a redesign or production rollout.

`modules/mail/src/ui` owns the native Webmail component, sanitized message rendering/preview, Mail forms and one-time-secret display, product headings/tables/getting-started presentation, navigation contribution and resource/settings/overview pages. Existing Console component paths remain wrappers.

The module has no application imports, environment access or cookie/header reads. Public UI DTOs are structural types. The Console retains session/tenant loading, redirects, cookie authentication and the `use server` action implementation. Client form wrappers pass a Next server-action reference into the module; Webmail receives the existing launch server action. Navigation receives the shell renderer instead of importing Console components. Server presentation factories receive explicit page-loading, read and form dependencies.

The existing Next server/client boundaries remain: browser code does not acquire provider credentials or server database access. Webmail sanitization, sandboxed message HTML, gateway checks, uncertain-send handling and no-repeat-send behavior are copied unchanged. The new launch-action dependency is included in the connection effect so swapping a composition cannot retain the previous action.

Verification: Console and API typechecks pass; the Mail module has its own JSX/strict TypeScript configuration. The root module suite passes 32 tests including the UI source-boundary check. Isolated Mail navigation/member/empty-state rendering passes. Full Console sidebar rendering also depends on the concurrent Clerk UI import compatibility work and is not claimed by the isolated check. The combined Console standalone Docker build also passed after Clerk integration; browser-authenticated mutation flows still require their own end-to-end environment.
