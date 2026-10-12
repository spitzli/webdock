# Webdock platform database migration and RLS

## Authorized scope

The owner explicitly requests migration now, with correct RLS and the Tabularis web feature preserved. Scope clarified: Webdock platform only. Independent Spitzli, Stall, demo-site databases, their credentials and browser runtimes remain unchanged. The existing single dedicated Webdock database is the destination; backups remain separately deferred. Temporary private migration exports and retaining the source are necessary migration controls, not an enabled backup product.

Source inventory (read-only): PostgreSQL18.6, about47MB, seven schemas/407 tables, no enabled RLS. Active platform schemas are webdock_auth, webdock_admin, webdock_mail and webdock. The public shared-CMS application is retired in source (API410); verify its deployment and preserve its data as an inaccessible runtime archive rather than silently reactivate it. Other schemas are out of scope.

## Design

- Preserve IDs, relationships, encryption/signing keys, sessions, grants, sequences and existing URLs. Never replace secret environment variables with Vercel's redacted `[SENSITIVE]` placeholders.
- Separate non-login object owners, migration authority, authentication bootstrap, business runtime, background worker and Tabularis identities. App roles are not owners, cannot assume owner roles, and have no BYPASSRLS.
- Business table policies use ENABLE+FORCE RLS, with explicit read and write predicates, including child tables. Missing/invalid authorization context denies access. Shared catalogs and trusted global operator/worker activity are classified explicitly; no blanket tenant runtime USING(true).
- Server-authenticated session contexts are HMAC signed and transaction-local; signatures bind database role/audience and expiry. Policy lookup helpers have fixed search_path, qualified names, revoked PUBLIC execution and a non-login owner. The public SQL browser cannot issue trusted contexts or spoof them through SET.
- Bootstrap identity access remains separate from scoped business queries so sign-in, MFA, OAuth, invitations, API keys and worker authentication do not depend on an already established tenant scope. All transport and native entrypoints must be covered; wrapping Studio alone is insufficient.
- Pg pooling must preserve BEGIN/COMMIT/ROLLBACK and callback/promise semantics. Context is installed on the same transaction connection, cleared by transaction end, and never leaks through PgBouncer reuse.
- Tabularis retains existing website binding/profile identity. It receives a dedicated constrained target login, verify-full CA mount, and narrowly scoped network access. Existing source-project browser permissions cannot become platform-wide access. Preserve unrelated browser runtimes.
- Controller-owned HBA/lifecycle must recognize explicit platform service logins. Protect the database hosting the control plane from ordinary self-pause/purge operations; recovery remains available through the existing root operations channel.

## Execution and gates

- [x] Inventory current production connections and source catalogs without writes.
- [x] Confirm scope with owner; preserve independent customer sites.
- [x] Export platform schemas consistently to private storage and verify source compatibility; build disposable test restore.
- [x] Add shared verified TLS and signed transaction-context pool helpers with tests.
- [x] Integrate session/bootstrap/worker boundaries and explicit RLS policy coverage; test real non-owner roles, two tenants, forged contexts, preview, callbacks, jobs and reuse.
- [x] Verify retired shared CMS and keep archive runtime access closed; preserve active website/Studio paths.
- [x] Integrate managed service role HBA/lifecycle and isolated Tabularis connection/CA/network handling.
- [x] Rehearse the real source archive restore with row/content/sequence/structural equality; exercise browser sign-in, tenant list and Payload Studio/website reads under non-owner roles. Verify Tabularis patch identity and TLS transport; final native browser acceptance follows its coordinated target switch.
- [x] Prepare reviewed production roles, policies, deployment environment deltas and write-freeze/rollback procedure.
- [x] Fence source platform writers, take final consistent export, restore/verify, then switch deployments and affected Tabularis runtime together.
- [x] Verify actual deployed DB identity, authenticated end-to-end flows, RLS negatives and unaffected customers. Keep old source fenced/retained; do not delete source resources.

Do not switch production while a gate fails. Rollback after target writes requires data reconciliation; pointing writers back at an old source is not a safe rollback.

## Production result

Platform cutover is live. The final snapshot matched data, sequences and SQL structure before additive migrations; 294 product tables now FORCE RLS. Native Studio/Tabularis SQL and disposable CRUD passed against the exact managed target with verify-full TLS. Independent customer databases remain on their existing connections; source platform tables remain fenced.

Temporary migration password is revoked, direct and pooled authentication reject it, and no temporary-role sessions remain. Root-only removal of LOGIN/CREATEROLE/memberships and the obsolete HBA entry is still pending because the 1Password SSH signer is unavailable. No cleanup completion is claimed for those attributes.
