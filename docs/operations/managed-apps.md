# Managed Apps correction — 2026-10-18

Tabularium is a dedicated customer application. Managed Apps operates the app; registry branding, kinds, manifest fields, providers and users stay in native Tabularium. Shared Umami analytics remains a separate product.

The old managed-registry alpha is yanked and rejected in the catalog. Immutable artifacts remain for traceability. It was never installed in production. The new source is /home/newt/Projekte/Personal/spitzli/webdock-extension-managed-apps. See verification/2026-10-18-managed-apps-correction.json for checks and current publication status.

The intended first app remains existing Tabularium app 104651089088876544 in project 104618288083894272 / customer 103216044377636864, origin https://registry.webdock.dev. Do not recreate it, alter its database, or attach the shared analytics app. Managed Apps needs no Tabularium admin token.

Before enabling a runtime: deploy the reviewed optional Hosting adapter, new apps capability contract, and updated offline plugin_scope RLS function together. Core-only builds intentionally return capability_unavailable when the Hosting adapter is absent. Configure the operator-owned runtime binding managedApps[projectID] = [{appID,kind:'tabularium',origin}] and exact apps capabilities; use the signed-release install and native readiness workflow. Never grant arbitrary cluster/SQL/provider access. Production API is not updated by this task; do not deploy the entire dirty worktree indiscriminately.

Trusted launch links are generated server-side after native Hosting authorization and rendered outside the unchanged allow-scripts iframe. Runtime callbacks live-revalidate stored native Clerk identity before restoring ConsolePrincipal; grant/revision/project checks remain enforced.

Screenshots are local in-memory UI fixtures, not production proof. Real disposable PostgreSQL tests cover Hosting action dispatch, idempotency, stale revisions, foreign actor/project denial, and capability revocation. Owned DB fixture was restored to stopped state; transient credentials removed.

## Publication checkpoint

Docs PR #39 merged as 03eb7df32548468eb457265713e67aa72bc03cad; live Managed Apps page and both app/setup screenshot downloads return 200. Plugin signed source commit a7e22f1976928e1ce1106fd97df57366a6f2606c and signed tag v0.1.0-alpha.1 are public. GHCR image uploaded at the recorded digest but still private. GitHub draft prerelease contains both JSON assets, lock and screenshots. Do not submit catalog until anonymous image pull succeeds.

T3 browser snapshot/evaluate became unresponsive; alternate CUA has no browser. User said they are restarting T3 browser. Resume: open https://github.com/orgs/spitzli/packages/container/webdock-extension-managed-apps/settings, switch package Public, verify anonymous pull with empty Docker config, publish existing draft (do not duplicate release), submit OAuth ownership to Webdock Registry, approve developer alpha without verified badge and verify signed release integrity using the previously pinned registry key 5d8025c66487bb44 (public key available in earlier analytics install input). Repository webhook may need manual setup because the GitHub App lacks hook-admin rights; preserve the generated registry hook secret, do not rotate existing secrets.

The schema for kind extension was additively updated ONLY to allow apps service and plugin.apps.read/manage capabilities. Existing kind prose/translations/schema fields were preserved. No Tabularium customer business settings were changed.

## Publication completed

Starting a fresh visible Preview tab restored browser automation. The Managed Apps package is public and anonymous OCI pull passed. Existing GitHub prerelease draft was published (no duplicate release). Registry entry managed-apps is approved without a verified badge. The actual downloaded descriptor and registry JWS passed verifyRelease against previously pinned key 5d8025c66487bb44. The manual release webhook was created with the existing registry-provided per-plugin secret; actual release.edited delivery returned 200 (the expected unsupported ping returned 400). No production Host installation or RLS rollout occurred.

Public release: https://github.com/spitzli/webdock-extension-managed-apps/releases/tag/v0.1.0-alpha.1
Catalog: https://registry.webdock.dev/plugins/managed-apps
Docs: https://docs.webdock.dev/developers/managed-apps
