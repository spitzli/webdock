# Navigation and viewer performance — second production pass

This extends the first performance release without replacing its authorization,
gateway, pool-budget, schema-preference or invitation-mail fixes.

## Changes

The Console uses the already-authorized tenant summary for navigation rather than
loading members, invitations and website access through `getTenant`. Management
links still require an active tenant and owner/admin/operator rights; preview
never enables management. Managed database pages load project context and
permissions concurrently, sharing the project read with their headers.

`projects.overview` replaces four overview calls with one bounded read transaction.
The empty-project regression counts 15 SQL statements instead of 74 and one
authorization transaction instead of seven. Application limits/order, latest-five
setup filtering, source ordering and live Mail/PostgreSQL binding health are
preserved. Credentials and full setup configurations are excluded from its DTO.

Better Auth no longer signs the unused `set-auth-jwt` header on every session read.
OIDC/JWKS signing remains enabled and was exercised by real protocol tests. Studio
operator status uses the freshly loaded native user's identical security flags,
removing an extra SELECT; session reads after introspection fall from six to four
queries. No cross-request authorization cache was added.

The embedded viewer starts its connection probe alongside driver discovery and
loads schemas, selected schemas and the preferred schema concurrently. Saved names
are still filtered against authorized schemas before metadata loads. A preloaded
runtime renders without another Suspense retry; its component identity remains
stable when preloading finishes late. The host's redundant lazy wrapper was
removed; browser effects still control when the authenticated workspace mounts.
Vendor patches/checksums and the installed-package guard include these changes.

## Production measurements

Representative authenticated browser samples, not a load/soak benchmark. See the
matching JSON for exact metrics and measurement definitions.

| Measurement | Result |
| --- | ---: |
| Project navigation | 0.955 s, previously 2.44 s |
| First new viewer bundle: schema ready | 4.643 s |
| First new viewer bundle: table list ready | 4.991 s |
| Reopening viewer: schema ready | 3.535 s |
| Reopening viewer: table list ready | 3.907 s |

Both viewer samples use the existing saved schema. The first downloads the new
runtime chunk; the second reuses browser modules. Before this pass the saved-schema
viewer took 7.05 s to schema state and 7.89 s to its table list. Opening the existing
test table still displays a result table; its SELECT took 0.294 s. No database schema
or customer rows were written for verification.

The remaining first-load cost includes the editor/workspace bundle and the necessary
session, connection and metadata requests. The improvements are not a claim of an
instant cold start on every device or connection.

## Verification and deployment

- 66 Console tests, 64 API unit tests, 11 integration tests, 318 ported tests,
 24 hosting-contract tests and 5 artifact tests passed. Four existing constrained-RLS
 tests retain their separate-fixture skips. An ambiguous varchar/text parameter in
 the new test fixture was fixed; the entire ported group then reran with zero failures.
- The vendored UI passed 5,698 tests across 404 files. Package declarations/assets,
 vendor digest checks, TypeScript, focused lint, local builds and independent review
 passed. The disposable API fixture was removed after verification.
- API image: `sha256:26a0ca2066c02655bbc2e1bbde27c0aa8169436578b950ab916e17f15da8ec78`.
 It overlays six API files and the hosting contracts onto the first performance image
 `51df9f64c173d06a3b2d7415f38e78141e9be92c31ee35d2c9b4a6da8df1c233`, preserving
 its independent invitation-mail fixes. Worker, gateway and Dragonfly were unchanged.
- Console: `webdock-admin-jf2xnl237-spitzli.vercel.app`, deployment
 `dpl_E2hgYPiAnwv5AsF9huPHjk6x3ygc`. Compilation was local; the existing
 `prepare-vercel-output.mjs` step restored root artifacts and removed dotenv mappings.
 Actual Function metadata reports only `fra1`; Vercel's control plane remains global.
- API rolled out first. The authenticated new overview endpoint returned 200 before
 promoting the UI. The protected Console root returned 307 in candidate verification;
 authenticated navigation, viewer initialization, schema restoration and table opening
 succeeded after promotion. API readiness is 200 and affected pods are ready. Final
 Console error-log query returned zero records.

Changes remain uncommitted in the existing isolated performance worktree. Private
release snapshots and logs are retained separately. Rollback must restore the prior
Console (`webdock-admin-ls4ds3h5g-spitzli.vercel.app`) before restoring the prior API
image, because the new Console uses the newly introduced overview command.
