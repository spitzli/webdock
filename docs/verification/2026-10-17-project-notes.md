# Project Notes local verification

Private source: https://github.com/spitzli/webdock-extension-project-notes. Generated using the existing backend CLI and extended through public SDK APIs. No registry listing/release, OCI image publication or production deployment was performed.

## Working local implementation

- Core document read/CAS-write HTTP adapter against existing plugin_document and operation-bound receipt tables; SDK ctx.data.
- Core host-owned periodic job scheduling and absolute runAt support for stable reminder idempotency.
- Notes CRUD, project panel and due-status reminders. Pending document state acts as a recoverable outbox; reconcile repairs overdue delivery after failed retries. No email/external notifications.
- Independent plugin process, scoped Core HTTP, actual restricted PostgreSQL roles/RLS and real Redis/BullMQ.

## Evidence

- Plugin build and 5 model/UI regressions passed. Review found stale forms could receive a newer revision without refreshed fields, edits could be lost during saving, and exhausted reminder retries could stay scheduled forever. Four regressions were observed failing, then fixed; all five pass.
- Core smoke passed: project isolation, stale-write rejection, same-input replay, conflicting idempotency input, concurrent CAS winner, BullMQ due reminder, separate-plugin restart retention, deletion and revoked grant denial. Five immutable data receipts were observed.
- Module suite: 126 passed, 3 Redis-only tests skipped in this suite. Separate Project Notes real-service smoke passed.
- Browser rendered notes in the sandboxed frame and the host retained Docs/project context; opaque frame scripting prevented direct DOM automation inside it, so save/refresh logic has unit regression coverage and real host API verification rather than a claimed automated form-click proof.

## Release gate

This authoring host inserts explicit fixture installation/release/grant metadata. It does not perform a signed-registry install or provision the production workload. Production installer, invocation issuance, quota/retention policy, host UI integration and image publication remain required before declaring an installable registry release. The placeholder manifest image digest must never be published as a runtime artifact.

The local preview and its owned PostgreSQL/Redis fixtures are intentionally retained for the user to try. Stop the host before running the fixture teardown; do not remove unrelated local containers.

Final review rechecked all three reported issues: no remaining important defects in that scope; all 5 plugin tests passed. The shared-queue periodic retention bug was separately reproduced (count cleanup could evict completed regular job IDs), fixed by retaining scheduled records as well, and covered by a real Redis regression. Full Core/jobs packed-package suite: 7 passed, none skipped. API check and Mintlify validate/broken-links passed. Private plugin source commit: be0d93f.

## Explicit alpha publication requested by owner

The owner subsequently requested public source and a registry release with English screenshots. Public prerelease `0.1.0-alpha.1` is available at https://registry.webdock.dev/plugins/project-notes and https://github.com/spitzli/webdock-extension-project-notes/releases/tag/v0.1.0-alpha.1. This supersedes the earlier no-publication status, not the production installer limitation. The GitHub organization public-package permission was enabled only after explicit owner approval; only this container package was switched to public. Exact signature/asset/image evidence is in `2026-10-17-project-notes-release.json`.

The final current preview is `0.1.0-alpha.2`; alpha.1 remains available with its original artifact bytes. Alpha.2 has a sharp English reminder screenshot and versioned absolute README image links. Strict webhook ingestion additionally requires `tabularium.json` as a release asset; it is byte-identical to the universal descriptor. Signed payload and both screenshot hashes were verified, and a release webhook delivery returned HTTP 200.
