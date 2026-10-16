# Invitation delivery recovery — 2026-10-15

Authentication SMTP port 465 timed out from the production API. Port 587 with
required STARTTLS and the existing credentials passed authentication. The API
now explicitly uses port 587; the mail helper also defaults to 587 and retains
implicit TLS for an explicitly configured port 465.

Better Auth catches errors in mail callbacks, including the nested password
setup callback for provisioned users. Administrative tenant invite/resend and
website invitation actions now track delivery promises in request-local storage
and check them before recording success. Failures return a safe public error
and mark the access event failed. The pending invitation remains available for
resending. Password-reset and verification endpoints keep their existing behavior.

## Verification

- Regression first failed with “Missing expected rejection” on the original code.
- New and existing invitees: delivery failure rejects, audit is failed, invitation
  remains pending, and recovery resends the same invitation exactly once.
- Native Studio transport returns the reviewed AccessError without SMTP details.
- API TypeScript passed. Native unit/integration groups passed under Bun 1.4.3;
  ported suites passed under Node 24: 314 passed, 4 opt-in cases skipped.
- Initial attempts used an incomplete Bun npm install, an older system Bun, and
  Node 25. Those runner failures were resolved by installing the pinned Bun and
  using Node 24. A repeated targeted run hit fixture rate limiting; the subsequent
  targeted and full ported runs passed.
- German catalog compiled (12 catalogs, 3941 messages). Console UI was not rebuilt;
  the newly returned error has an English fallback until its next UI deployment.
- Production SMTP authentication, health and readiness passed after rollout.
- Browser showed the pending invitation and enabled Resend invitation button.
  No real invitation or other email was sent during this task.

## Release

The image overlays only three matched API source files on the exact prior runtime.
Its network-disabled smoke check covers success and swallowed callback failure.
Previous API image: `sha256:6c5b34663c397e4e9793935efe73afb84b6435a858c3d9dafdea6fcfba39d7cf`.
New API image: `sha256:602d93ae58262974410a82cf7c70a8eb73f00272283456f8e465a02420c1d462`.
The deployment update tested both resourceVersion and previous image. A private
pre-change deployment snapshot was retained. Rollout completed; all three source
hashes matched the running container. Worker image and database schema are unchanged.
