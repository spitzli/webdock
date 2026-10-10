# Orama realtime search

The user requests live search across projects, customers and other existing search controls, using Orama. The malformed Selfservice permissions layout in the screenshot is a deferred UI TODO; do not silently mix that redesign into search.

Use pinned OramaJS locally, not Orama Cloud. A shared package implements accent-insensitive prefix/fuzzy matching with substring compatibility. Index only explicit fields from already-authorized data. No global cross-user index, browser persistence, external search service or secret indexing. Keep current sort/filter semantics and URLs.

Server lists scan authorized data before pagination, with bounded batches where relevant. Client editors search only the data their existing contract exposes and keep their explicit “on this page” label; do not pretend page-local CMS editors search the entire external database. Preserve dirty edits while filtering.

- [x] Shared Orama search + tests (partial names/domains, typos, all query terms, exact IDs, isolated corpora, pagination beyond first page).
- [x] Common debounced live-search form, stable input focus, latest query, URL/back/reset/filter behavior and composition input.
- [x] Project/customer/activity server search and hosting/Auth list queries.
- [x] Existing client website/content/shop/request searches and custom inventory/mail forms; inventory remaining CMS lookup surfaces and integrate without broadening access.
- [x] Sequential local DB suites, typechecks, browser verification, review and local/prebuilt fra1 rollout.

Current data is small; request-scoped indexes favor fresh authorization and correctness over shared cache complexity. Search result order follows the existing chosen sort. No schema migration required.

Review found and fixed three form edge cases: late responses after blur, optional select reset defaults, and reset before debounce when the URL has not changed. Local browser checks include all three (the late-response check deliberately held one RSC response), rapid typing, focus retention and browser back. Core tests search a target in the second 300-row batch and reject access to the foreign tenant. Generic CMS relation lookups already update as typed; their existing per-instance API contract remains unchanged.

Completed: 99 Admin + 86 Auth + 4 shared search tests; both typechecks and local prebuilt builds passed. Production deployments READY with actual fra1 metadata. Real operator browser verified projects, customers, Auth-backed clusters, focus, reset and mobile layout. Evidence: `docs/verification/2026-10-09-realtime-search.json`.
