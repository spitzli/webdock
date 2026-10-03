# Independent Payload instances implementation plan

Goal: replace shared runtime tenancy with independent website+Payload deployments, sharing the Neon project/database infrastructure only. Each instance owns a PostgreSQL schema and has a separate minimally scoped DB role.

- [x] Back up the current central DB and export current content/drafts/history/users per Site.
- [x] Provision `webdock`, `spitzli`, `stall` schemas and private per-instance role credentials. Prove SQL cross-schema isolation.
- [x] Restore each app's own Payload/admin with current data and visible protected system-operator role. Preserve frontend, media, contact and previews.
- [x] Copy existing public Blob originals and derivatives into owned instance prefixes, leaving rollback sources intact.
- [x] Generate schema-qualified fresh migrations; import records and versions; resequence serial IDs.
- [x] Verify operator protection, customer access, data parity, admin responsiveness and public endpoints.
- [x] Deploy app instances in Frankfurt near the DB; verify before retiring central editing.
- [x] Preserve a concrete design for optional Payload provisioning and later customer self-service. Do not build customer panel, dynamic collections or a new page builder in this phase.

Future control plane: tenant records exist independently of CMS instances; `cmsEnabled` defaults false. An operator-driven enable operation provisions schema/role/deployment/secrets/operator account, then records readiness. Customers never receive master DB/Vercel/SMTP/storage credentials. Instances use explicit versioned templates, upgrade/migration jobs and recovery paths. Schema/table creation is infrastructure work, not arbitrary browser-submitted code.

Keep the requested Plausible per-site tracking module TODO. Existing project's page/block editor remains usable; a platform-wide collection/page-builder editor needs its own design and permission boundary.

## Identifier decision (pending user choice)
- New platform-owned entity IDs must use either ULID or Snowflake; the user has not chosen yet.
- Do not implement a new platform ID generator or select UUID/serial for new control-plane entities while this is pending.
- Preserve existing framework-issued Payload IDs during migration so references and history remain intact. A later Payload ID migration requires separate compatibility planning.
- Physical schema names and existing site keys are labels/configuration, not a choice of future platform entity ID format.

## Verified cutover — 2026-10-03

All three independent production deployments are ready in `fra1`. Signed application commits: Webdock `5e91f30`, Spitzli `1ac42ad` (restoration `cad11bc`), Stall `674033e`. The central runtime was retired in `eb64e18`; its old API returns 410, and `/admin` leads to the independent admin links.

- Read-only final source check at 11:34 UTC reported no drift; all nine cross-schema SQL reads were denied.
- Destination parity checks passed after deployment: Webdock landing/history/account, Spitzli four projects and 28 histories/account, Stall seven pages, 26 media and 51 histories, drafts/locales included.
- Live API access checks and real browser login/content screens passed; disposable accounts were removed. SMTP tests use no real notification messages.
- Existing password hashes were retained. Operator recovery was tested with a disposable local account, mocked mail, genuine recovery tokens, invalid/reused token rejection and customer attack cases.
- Vercel's automatic links to the old Neon resources were disconnected; old databases, source schema and media remain intact. Application environment values now contain restricted instance credentials; unused central CMS keys were removed.
- Existing uncommitted Stall seed/test changes were left outside the migration commits.

The shared database and storage remain shared infrastructure. Production/preview/development use each site's same schema for now; separate preview branches are future provisioning work. `spitzli.dev` still serves GitHub Pages, so its usable admin is `https://spitzli.vercel.app/admin`. The ULID/Snowflake decision remains open and no new control-plane entity generator was implemented.
