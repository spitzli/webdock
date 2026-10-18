# Core BullMQ and first extension verification

## Implemented

- Core BullMQ 6.3.16 / ioredis 6.0.0, persistent per-domain scheduling directly used by worker.ts; PostgreSQL business-operation leases/journals retained.
- Core scoped plugin-job service with bounded HTTP API; SDK ctx.jobs.enqueue/get/cancel and plugin.jobs.read metadata.
- Local backend CLI create/validate/build/pack; independently generated private repo https://github.com/spitzli/webdock-extension-job-demo at commit 188266b.
- Compose persistent Redis service and Helm external Redis requirements; no production rollout or registry release.

## Checks

- Real Redis Core scheduler ownership and restart, unavailable-Redis cleanup regression, plugin API/project isolation, read-only rejection, duplicate/conflicting input, retries, delayed/active cancellation and execution-time revocation passed.
- Packed SDK/CLI installed offline in an empty temporary directory, then scaffold, validate, TypeScript build and descriptor pack passed. The packed fixture ran an actual separate plugin process through HTTP → Core → BullMQ/Redis → worker → plugin. Result: HELLO FROM BULLMQ and expected SHA-256. Duplicate invocation returned the same job ID. Fixture image digest is deliberately not a published artifact.
- The actual restricted-role worker.ts storage profile completed a PostgreSQL business job through BullMQ, then exited on SIGTERM: 1 test, 3 assertions passed.
- Core/plugin-job strict TypeScript check and API check passed; API unit suite 151 passed.
- Independent fresh-context review found startup cleanup hanging when Redis was unavailable. Reproduced as a failing timeout, fixed with forced closing of initializing sockets; regression now rejects at the 10-second readiness deadline and exits. No other important issue reported in the reviewed local scope.

## Limits

The plugin HTTP adapter has mandatory host authority/dispatch ports; production plugin invocation authentication, quota/retention policy and container installer remain unfinished and are not substituted with fixture grants. No automatic public plugin endpoint is mounted with fabricated authority. The plugin fixture runtime token is local-only, not the production invocation protocol. No SDK/CLI npm package or plugin release has been published. Production worker deployment requires Redis provisioning before rolling out this branch.

Final checks: combined Core/plugin Redis integration 5 passed (0 skipped); module/SDK suite 125 passed with 3 Redis-only cases skipped in that no-network run and covered by the explicit integration run; CLI test 1 passed; chart/schema assertions passed; Mintlify build validation and broken-link checks passed. Test PostgreSQL/Redis containers owned by this execution were removed afterward.
