# Embedded table navigation — 15 October 2026

Opening a table used the shared Tabularis `openEditor` action, which navigates to
`/editor` with the table/schema/query in route state. The embedded workspace only
registered `/connections/:connectionId/editor`, so its catch-all incorrectly
reported that the database was unavailable.

The UI patch adds the same `/editor` route and `ConnectionEditorRoute` used by the
standalone application. Existing connection guards, editor state and the host URL
remain unchanged. The backend/runtime source pin remains `fdd6c0a6`; only the
vendored web UI archive changed. Its additional source patch and regression test
are recorded in `vendor/tabularis-web-ui-editor-routing.patch` and the archive's
checksum/provenance in `vendor/tabularis-web-ui.json`.

The regression test reproduced the exact error before the fix. All 30 focused
embedding/navigation tests passed afterward, including preserved table/schema
intent, one editor mount, no reconnect and unchanged host URL. In the collaborative
browser, the old packaged UI reproduced the failure when opening a synthetic
`app.test` table. The new package displayed its grid and synthetic row, issuing
the expected scoped SELECT with no browser errors. No customer database was used
for this browser check.

Console's 51 tests, TypeScript and local production build passed. The patch applies
cleanly to its pinned source, and the new archive checksum was verified. Independent
review found no blocker. The locally prebuilt production artifact is
`webdock-admin-gtxzrj22w-spitzli.vercel.app`; Function region `fra1` was verified.
The Console proxy was switched with resource-version and previous-value guards.
API, gateway, database services, roles and customer tables were not changed.

Rollback restores the previous Console proxy target
`webdock-admin-oq3fpnr72-spitzli.vercel.app`. Private proxy snapshots are retained
outside Git. Existing browser tabs must reload to obtain the corrected UI bundle.
