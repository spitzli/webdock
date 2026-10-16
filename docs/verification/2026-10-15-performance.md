# Production performance changes — 15 October 2026

The Console, API and database gateway are deployed with the measured latency fixes.
Dragonfly v2.0.2 was already running as `webdock-platform/views`; the API has
`VIEW_CACHE_URL`, authenticated PING succeeds, and public-branding requests produce
cache hits. It is a presentation cache, not an authorization cache. No second
cache instance was provisioned.

## Changes

- Console resource/tenant loading overlaps the independent tenant-list request.
  Equivalent registry reads share React's request cache; new requests authorize
  again and mutations are not cached.
- Portal SSO calls the local native OAuth provider instead of making a public
  HTTPS round trip. SSO, Studio and hosting share an introspection result only
  within one active request, bound to provider, token, client, secret and handler.
  Native session, MFA, tenant and resource checks remain in place.
- The gateway shares only a concurrently pending session inspection. Settled
  results are discarded; fresh requests, periodic revalidation and response checks
  still observe expiry, revocation and logout.
- Platform PgBouncer per-role pool size is 2 instead of 1, with its existing total
  cap of 10 unchanged. API business/auth/worker pools and registry pool are capped
  at 2; the separate background worker retains its previous configuration.
  The active hosting-agent renderer was updated with the same bounded setting.
- Tabularis runtime and Monaco code load concurrently with session launch. The
  small vendored source patch, tests, archive checksum and package-tree digest are
  recorded in `vendor/tabularis-web-ui.json`.
- Viewer launch uses the existing same-origin `/api/portal/studio` endpoint,
  avoiding a Vercel Server Action and its additional rendering work. Origin,
  session and database permissions remain enforced by the same API. The client
  retains a 45-second deadline and exposes only validated public launch fields.

## Production observations

Authenticated browser samples, not a load test. Full measurements and caveats are
in `2026-10-15-performance.json`.

| Measurement | Before | After |
| --- | ---: | ---: |
| Project navigation response | 4.30 s | 2.44 s |
| Session read | 0.42–1.13 s | 0.29–0.38 s |
| First viewer start to schema selection | 13.36 s | 7.08 s |
| Initial viewer RPC burst | 1.46–3.87 s each | about 0.32–0.35 s for the main reads |
| Viewer launch, after direct API change | 1.28 s via Server Action | 0.41 s |

The final saved-schema session reached schema state in 7.05 s and the table list
in 7.89 s. It reused browser assets and restored preferences, so it is not a second
cold-download benchmark. Startup still includes a substantial UI initialization
cost and sequential connection/schema discovery; it is faster, not instantaneous.
An existing table opened successfully with a result table; its SELECT request took
0.32 s. No table, schema, customer row or database credential was modified.

## Checks and release

66 Console tests, 64 API unit tests, 11 API integration tests, 315 ported tests,
16 SSO tests, 21 gateway tests, 8 database-renderer tests and 5 artifact tests pass.
The vendored UI passed 5,692 upstream tests. API/gateway builds, Console's local
production build, TypeScript and focused lint checks passed. Four restricted-RLS
tests and three real-runtime gateway tests retain their opt-in fixture skips.
Password/MFA login was covered by automated security tests; a new production login
was not repeated during the existing authenticated browser session.

Final Console: `webdock-admin-ls4ds3h5g-spitzli.vercel.app`.
All deployed Function metadata reports `fra1`. Build compilation was local;
Vercel's packaging/control plane remains global.

API: `sha256:51df9f64c173d06a3b2d7415f38e78141e9be92c31ee35d2c9b4a6da8df1c233`.
This overlays only the five changed API files and SSO package onto the concurrently
released invitation-mail image `602d93ae58262974410a82cf7c70a8eb73f00272283456f8e465a02420c1d462`.
Its mail fixes and `SMTP_PORT=587` are preserved. The worker was not replaced.

Gateway: `sha256:63539e113b27704e7c27e4b19b3b2a11e65d5c2df10409c2049e4d8bab81019e`.
Its pinned Tabularis backend runtime remains unchanged.

The source worktree was advanced to `8f92389` before the Console build, preserving
the simultaneously released schema-preference and vendor-build verification fixes.
Changes are uncommitted in the isolated performance worktree.

The first Console candidate omitted its home-page artifacts because the existing
`scripts/prepare-vercel-output.mjs` step was missed. The proxy was rolled back
immediately. The final release ran that step, which restores the parallel-route
home page, removes dotenv references and pins Frankfurt. Its protected root route
was checked before promotion, then the authenticated Console and viewer were checked.
The temporary dotenv upload exception was removed. Final deployment error-log query
returned no records; API readiness and all affected pods are healthy.

Resource-version/old-value guards protected deployment and proxy changes. Private
pre-change manifests, renderer backup, image metadata and logs remain in the local
performance release directory. The prior Console target is
`webdock-admin-1bik7e4yk-spitzli.vercel.app`; the API rollback target is the invitation
mail image above, preserving that independent release.
