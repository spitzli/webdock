# Mail identity boundary verification

Continuation of the modular Mail work, verified locally on 2026-10-15 with Node 24.21.0 and the repository's Bun 1.4.3.

## Delivered

- `packages/core` defines local identity/session/membership contracts and the typed database reader.
- `adapters/auth-better-auth` implements current local projection reads and maps verified header sessions to stable local references, excluding provider tokens and unrelated user fields.
- Native mailbox access, product Mail access and onboarding manager admission reside in `modules/mail` and consume explicit identity dependencies. The API retains compatibility exports and HTTP/database composition.
- All direct Better Auth SDK session calls in API Mail services now use the shared session-reference resolver. Remaining tenant/grant-management SQL and database RLS projections are not claimed as provider-independent.
- Sending-account verification joined the turboSMTP adapter. Mail errors have one shared runtime identity in `packages/mail-contracts`.

## Checks

| Check | Result |
| --- | --- |
| Module/adapter/identity unit and boundary suite | 21 passed |
| API unit suite, including frontend import boundaries | 69 passed |
| Selected complete Mail/Studio/provider regression suite | 104 passed; restricted-role case skipped in this runner |
| Restricted-role Mail case, separate RLS fixture | 1 passed |
| Access regression file after adding session-expiry coverage | 4 passed, including 1 new expiry case; 3 overlap the selected suite |
| API TypeScript and build | Passed |
| Console TypeScript | Passed |
| Generated Mail OpenAPI snapshot | Matches application contract |
| Mintlify build validation | Passed |
| Mintlify internal-link check | No broken links |
| Browser preview | New page, developer navigation and lifecycle section inspected through T3 preview |
| Independent source review | No concrete actionable issue found |
| `git diff --check` | Passed |

196 distinct tests passed across these selections. The new policy tests inject an alternative identity directory and cover expired/missing/preview identities, bans, setup flags, current membership, operator scope, explicit mailbox grants, queued grant revision checks, scoped keys and fenced jobs. Real PostgreSQL tests verify retained behavior and restricted session/key/worker roles. Provider requests remain fixtures, with external HTTP blocked.

Public docs now include `developers/modules.mdx`, linked from the developer navigation, local-development guide and Mail guide. The internal architecture page and migration-status record identify what is implemented and what remains.

The first Mintlify invocation was made from the repository root and failed because the docs root is `docs/`; validation and link checking were rerun successfully there. No account signup or documentation publication was performed.

## Operational scope

Local disposable PostgreSQL fixtures were created with the repository scripts and removed after verification. The Mintlify preview was left available on local port 3337 for inspection. No production migration, live mail delivery, provider provisioning, deployment, commit or release publication occurred. The previous Console production-build evidence remains in the first-slice record; this continuation did not change Console rendering code.
