# Native database browser verification — 2026-10-10

## Delivered scope

Studio has a tenant database directory, operator binding/grant forms and a native Tabularis workspace with explorer, SQL editor and grid. It follows Studio language/theme and adds focus mode plus browser fullscreen with focus-mode fallback. Changing display mode or locale does not remount the editor. The mobile workspace starts with a collapsed explorer.

Auth binds each access grant to a project database, subject, permission profile, isolated runtime origin and connection ID. Launch codes are one-time/60 seconds; sessions are native-session- and grant-revision-bound/15 minutes. The gateway checks authorization for RPCs, in-flight results and WebSocket events. Runtime origins cannot be reassigned to another user/database/profile. PostgreSQL roles enforce SQL privileges.

Tabularis is based on PR #676 at `aeb589e6a3fdd091184a3693bb2f8629bff46f96`, including its October 10 update. The exact adapted source commit, reconstructible patch, artifact checksum and build command are recorded in `vendor/tabularis-web-ui.json`. The separate source worktree is `/home/newt/.t3/worktrees/tabularis/webdock-web-package` on `t3code/webdock-web-package`.

## Evidence

- Updated Tabularis suite: **399 files, 5,688 tests passed**. It includes client startup isolation, routing/appearance boundaries, scoped portals, sequential partial grid mutation acknowledgements and existing desktop/web transport tests.
- The final collapsed-explorer layout adjustment: **4 files, 11 embed tests passed**. Typecheck, ESLint/theme-token checks, standalone Vite build and library packaging also passed. The packaged declarations were checked from the Webdock consumer with `skipLibCheck=false`.
- Database contracts: **3 tests passed**, covering strict input/tenant fields, origins and secret-free DTOs.
- Gateway deterministic suite: **7 tests passed**; the two real-runtime tests are intentionally opt-in. Assertions include command/connection spoofing, exact CORS, read/schema capabilities, nested saved-tab ID mapping, bounded parallel metadata calls, in-flight revocation and WebSocket revocation.
- Auth PostgreSQL integration: passed against a dedicated disposable PostgreSQL 17 database. It verifies cross-tenant and same-tenant/different-user access, operator MFA, removed membership, preview restrictions, grant revisions, permanent runtime ownership, expiry, revocation and concurrent single-use launch consumption.
- **Both real-runtime tests passed** against the updated Rust server and actual PostgreSQL reader/writer roles. Reader SELECT succeeds, writes/auth-schema access fail. Writer inserts, updates and deletes its test record, but schema changes/auth-schema access fail; cleanup restores the original fixture data.
- Studio, Auth and gateway TypeScript checks passed. Focused Studio ESLint passed. Auth and Studio production builds passed; the final Studio artifact build was repeated after installing the updated package.
- Browser in T3 preview: actual SQL `select * from browser_demo.orders` produced three synthetic rows. Focus mode filled the viewport and returning preserved query/results. English→German switching preserved an unsaved `select 42 as answer` draft; execution returned 42. Light/dark followed Studio. The host URL and document title remained Webdock's. At 390×844 the focused workspace and document were exactly 390px wide. A different-tenant fixture identity got a 404 on the database detail route.
- Browser fullscreen is implemented with the Fullscreen API and `fullscreenchange` handling. The embedded T3 preview did not complete its native fullscreen request; focus mode was verified as fallback. Native browser fullscreen enter/exit still needs a check in a regular browser.

Logs were produced locally under `/tmp/tabularis-update-*`, `/tmp/tabularis-native-layout-*`, `/tmp/webdock-db-*` and `/tmp/webdock-update-live-tests.log`. These are transient execution evidence, not deployment artifacts.

## Review and corrections

One independent read-only review found partial grid-write replay risk, nested tab connection IDs, portals outside the workspace CSS scope and secondary-window navigation. All four were addressed. In-flight authorization was also rechecked before releasing results. The updated upstream title behavior was retained for standalone Web while preventing host-title changes when embedded.

GitNexus impact/detect-changes ran in the Tabularis worktree. The initial package extraction had a broad/critical shared-UI impact and was covered by the full suite. The upstream rebase title adjustments had medium aggregate impact. The explorer rail adjustment had one direct caller and low impact. A stale GitNexus incremental FTS index was rebuilt before final checks.

## Limits and activation

No production migration, deployment, customer query, package publication or upstream push was performed. Automatic runtime/container provisioning is not included: operators register already isolated runtimes. Use `apps/database-gateway/README.md` and `.env.example` for activation and handoff to GitOps.

The browser fixture uses deterministic identities/introspection and real sealed Studio cookies. It exercises the actual Studio adapter, database services, gateway, Rust runtime and PostgreSQL, but not a full production OIDC login ceremony. Local TLS uses a fixture CA. Production expects a stamped backend source commit; debug fixtures bypass that pin only in their explicit test configuration.

Unsaved SQL tabs belong to the upstream browser session and are not restored when a new Webdock session is opened. Named saved queries remain the way to retain SQL in the isolated runtime. No cross-user localStorage persistence is introduced. Some shared upstream controls remain visible but fail closed for unsupported host configuration/import/extension/window features. Native fullscreen and production resource sizing are not certified by the local checks. Runtime scheduling, audit retention, expired-row cleanup scheduling and real deployment activation remain operational work.
