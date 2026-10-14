# Canonical Mail API origin — 2026-10-14

Mail v1 is now served at `https://api.webdock.dev/api/mail/v1`. The previous
Auth origin is an explicit alias on the same mounts. Requests are not redirected:
keys, quotas, revisions, raw bodies and idempotency state use the same handlers.
The public OpenAPI route has the same alias. Runtime OpenAPI servers stay
relative so local development does not send requests to production; the hosted
Mintlify export resolves the canonical API origin.

OAuth protocols, Mail gateways and provider-event receivers retain their
existing host boundaries. No schema, provider account, credential, worker,
Mail activation switch or ingress route was changed.

## Verification

- Added regression tests first; two HTTP-policy tests failed on the old host
  handling and passed after the explicit alias support.
- API standard suite: 75 native tests and 299 ported tests passed; four separate
  opt-in database-role tests remain skipped by that standard command. No RLS or
  database schema was changed. The owned disposable local fixture was removed.
- Real Mail integration test checks all 29 operations on both origins: a missing
  API key returns 401; the OpenAPI document returns 200; foreign hosts and internal
  Mail endpoints on the API host return 404.
- API TypeScript/build and all 50 Console tests passed.
- Mintlify build and broken-link checks passed; all 55 public routes loaded.
  Sampled internal BYOK records returned 404. BYOK onboarding and disconnect
  wording were corrected after independent review against implementation.

## Release

The API image was built locally from the exact existing runtime, with only
`dist/app.ts`, `dist/route-manifest.ts` and `dist/protocols/legacy-auth.ts` replaced.
The pre-change files matched the repository baseline. No dependency install or
remote build occurred on the production server. The resulting image passed a
network-disabled container check for both Mail hosts before import.

Previous image: `sha256:cf89c824dc50b445384b9890e4c14db4366d03fca88a4dbe436f17a69d3f44fa`.
New image: `sha256:49c29baefe959fad194f3aa971c20f13e024265166698996cb31204fc990dd7b`.

The existing `webdock-platform/api` deployment was updated with an image-value
precondition. Rollout completed and the running image digest matched. SHA-256
checksums of all three changed runtime files matched the local artifact.
The previous image and deployment snapshot are retained for rollback; the
repository Kubernetes manifest now pins the new image.

Live TLS checks on both public hosts returned 200 for OpenAPI and 401
`missing_api_key` for GET/POST emails. API health/readiness returned 200.
POST requests to the internal Mail gateway and provider-event paths on the API
host returned 404. These were unauthenticated smoke checks: no real message was
sent and no production credential was used. Authenticated Mail/provider behavior
was tested against local fixtures, not a new production delivery.

The public docs and Console's example strings use the API origin. Mintlify's
hosted deployment and a newly deployed Console UI artifact are not certified by
these API checks.
