# Adapter layout verification

The owner requested product/provider directories rather than flat prefixed directory names. All nine adapter entries now live under `adapters/<area>/<provider>`; the eight npm packages retain their original names and public exports. Kubernetes remains runtime metadata for the separate enrolled Python agent, not a new npm package.

Updated root workspace discovery, lockfile workspace paths/links, source-boundary tests and current architecture/developer documentation. Historical verification and plan paths remain dated records. The module test runner already walks directories recursively; Docker build contexts already include nested adapter sources.

Verified on 2026-10-16:

- npm install updates all eight workspace links to their nested locations.
- Module/adapter suite: 101 pass.
- API unit suite: 99 pass.
- API and Console TypeScript checks pass.
- Control Plane Docker target builds with a fresh `npm ci`, confirming nested workspace resolution in an isolated build.
- Mint build validation and broken-link checks pass.
- No old flat adapter paths remain in active source/configuration or the lockfile.

This is a filesystem/documentation refactor. Package API, provider behavior, stored credentials and runtime protocol URLs remain unchanged. PostgreSQL integration fixtures and live providers were not rerun for the path-only change; the preceding full regression evidence is in `2026-10-15-platform-completion.md`. No deployment or publication was performed.
