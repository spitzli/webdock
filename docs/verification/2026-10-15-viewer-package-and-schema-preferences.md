# Viewer package verification and schema preferences

The recurring table-opening failure came from the installed dependency used by
the subsequent Console release, not a missing source merge. `main` contained the
corrected vendor archive, but the installed `@tabularis/web-ui` files still came
from the older archive with the same package version. The live release
`webdock-admin-go98wibg9-spitzli.vercel.app` served
`/_next/static/immutable/chunks/1qtinx0xad0i_.js`; inspection confirmed its embedded
route table omitted `/editor`.

The admin build now checks both the vendor archive checksum and a deterministic
digest of the installed package's payload files. A stale or incomplete install
fails before Next.js builds and requests `npm ci`. Nested dependencies are excluded
from the payload digest. Three regression tests cover a matching install, stale
files despite identical package versions, missing files and archive tampering.

Schema choices now persist in browser localStorage per authenticated user, database
ID and managed/registered viewer kind. Both selected schemas and the active schema
survive a new gateway session. Only schema names are stored, never SQL, query results,
session tokens or credentials. All four schema RPCs still call the authorized
upstream first; failed calls do not save choices or turn into cached successes.
Malformed, disabled or full browser storage falls back to normal upstream behavior.
Existing Tabularis code filters restored names against currently available schemas.

This is a preference for the current browser, not cross-device synchronization.
Clearing browser site data removes it. Saved SQL and notebooks retain their existing
temporary managed-session behavior.

## Verification and release

- 61 Console tests, TypeScript and focused lint passed.
- The three vendor checks and two prebuilt-artifact checks passed.
- Independent review found no functional/security blocker.
- The collaborative browser selected `analytics` in a synthetic database, reloaded
  with a different connection/session ID and an empty upstream preference store,
  and restored `analytics` without another selection prompt. Opening its `test`
  table displayed the synthetic row and executed a query scoped to `analytics`.
- A fresh dependency install passed the new package guard and local production
  build. Artifact packaging restored the real root page as before.
- The new immutable Console artifact is
  `webdock-admin-1bik7e4yk-spitzli.vercel.app`, with verified Function region `fra1`.
  The production proxy target changed with resource-version and old-value guards;
  its rollout completed. The newer project-setup changes remain included.

No production database, API, gateway, schema, role or table was modified. The
previous Console target and private proxy snapshot remain available for rollback.
