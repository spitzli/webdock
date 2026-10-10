# GitHub Actions builds, Webdock publication

The user changed the delivery architecture on 2026-10-10: repositories build on GitHub Actions; Webdock receives and publishes immutable artifacts. No dedicated untrusted build server is required. This supersedes the isolated-worker requirement for sources explicitly configured with `buildProvider: github-actions`; existing isolated sources remain compatible.

## Contract

A source binds a repository ID, branch, workflow path and artifact prefix. Successful first-attempt push/manual runs are verified through narrowly scoped installation Actions-read tokens. The current branch SHA, head repository, workflow, successful conclusion, source configuration timestamp and immutable artifact ID/digest must agree. A later-arriving older run cannot replace a newer accepted run. PR/fork runs and reruns are not publishable. New manual workflows can rebuild the same commit.

GitHub artifacts contain `manifest.json` and `artifact.tar`; the ZIP and TAR have separate checked SHA-256 digests. Bot output contains one OCI `image.tar`; panel output contains prebuilt Vercel output and explicit production target settings. The importer checks central-directory bounds before parsing ZIP, file paths/types/limits, manifest provenance and recipe output. It stores normalized artifacts and reuses existing fenced build/release/approval/reconciliation/retention logic. Automatic publication rechecks the branch head before authorizing a write.

The trusted publisher uses `isolation: artifact-only`, never receives source or invokes a build/VM fallback, and never executes customer scripts. Vercel credentials stay in its private trusted publication path. GitHub-hosted geography is not represented as EU-verified. Runtime secrets remain separate. Webdock build-variable injection is rejected for Actions sources; repository workflows own build configuration.

## Verification and activation state

- Real local Lunares bot OCI and Node 24 / Vercel CLI 63.1.2 prebuilt panel builds passed without production credentials.
- Both actual local artifacts passed the complete ZIP/manifest/TAR/recipe importer path.
- Lunares PR #6 adds pinned Actions workflows and packaging tests; hosted execution is checked separately below.
- Local Auth suite: 121 tests passed before final review fixes. Provider regression suite: 17 passed. Publisher archive and metadata tests run separately.
- Review found and fixed missing persisted Actions permission, same-SHA run ordering and stale automatic publication. ZIP central-directory preflight added for memory bounds.

Activation still requires installation-owner consent for Actions read and Workflow run subscription, deployment-capable Vercel integration credentials, private registry/pull policy and enrollment of a trusted artifact publisher. No successful live Actions-to-production rollout is claimed by this document.

Hosted acceptance: Lunares PR #6 head `78c07d9` passed all four GitHub checks. Run `38054368971` built both actual artifacts. Downloaded GitHub artifacts were imported and validated successfully (panel 4,106,240 bytes; bot 56,821,760 bytes). This validates hosted build output and importer compatibility; PR artifacts remain deliberately ineligible for production. Final worker suite: 52 passed. Admin suite had one missing-translation failure, corrected and its two i18n tests re-run successfully.

Final Auth regression suite after review corrections: 127 passed, no skips. Both Auth and Admin TypeScript checks pass. Actions archive regression suite rejects excessive ZIP directory counts before parsing. Vercel project regional policy now reads the actual nested resourceConfig API shape, covered by six adapter tests.

Final Admin suite: 106 passed, no skips. The existing authorized Vercel project connection successfully set explicit `npm ci` / `npm run build` settings on Lunares, matching its checked-in Actions build snapshot; no deployment was triggered. The GitHub App form has Actions read and Workflow run prepared but not saved; API verification still reports no Actions grant.
