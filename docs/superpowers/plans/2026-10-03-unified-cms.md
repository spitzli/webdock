# Unified CMS implementation plan

Goal: separate customer organisations (tenants), independently deployed sites and enabled content modules; migrate actual Webdock, Spitzli and Stall content without inventing features.

Architecture: Payload 4 central backend, site-scoped service accounts, tenant memberships with roles, explicit module policies, versioned content endpoints. Each frontend keeps its UI. Contact sending never uses a content-reader credential.

## Ordered rollout
- [x] Add Sites, per-tenant membership roles and separate Integrations auth collection; retain old reader compatibility until Webdock cutover.
- [x] Add site/module access controls and versioned content responses. Reject cross-site relationships, disabled modules and unpublished reads.
- [x] Import source live content (locales, media, settings, publication states) into additive tables; preserve source databases.
- [x] Adapt Webdock, Spitzli and Stall frontends independently. Preserve contact, rate limits, maintenance and preview security.
- [x] Test with two tenants, two sites per tenant, editors, readers, disabled modules and direct REST/versions/relationship queries.
- [x] Review permissions; deploy CMS first; verify service reads; deploy frontends; verify live routes and remove site-local admin endpoints.
- [x] Document backups/rollback, remaining constraints and initial credentials without putting secrets in git.

## Constraints
No horse profiles. No generic page-builder framework, billing or plugin marketplace. PostgreSQL schema push remains disabled. Public media are explicitly approved assets. Super-admin account is global; tenant filtering must not hide it from user administration. Enabled module visibility is supplementary to API access checks. Existing source dirty files must not be committed or replaced.

## Requested follow-up
- [ ] Tracking module for Spitzli, Webdock and Stall: enable per site and configure a Plausible script. Preserve site isolation, validate script source/configuration, and account for CSP/privacy settings. Requested by user 2026-10-03; not part of the current migration implementation.
