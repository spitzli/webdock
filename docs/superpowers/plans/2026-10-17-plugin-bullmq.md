# BullMQ plugin jobs and first authoring fixture

The owner requested BullMQ, a plugin-facing API, and a first test plugin before publishing. This specializes the existing runtime/developer-platform design; it does not replace the unfinished installer. The later owner clarification below expands this into Core worker scheduling.

1. Add bounded enqueue/get/cancel contracts and `plugin.jobs.read`, SDK HTTP client, and BullMQ-backed host service. Scope comes exclusively from authenticated host context. Every operation and worker dispatch requires a live authorization callback; fail closed without it. Delay <=7 days, payload <=32 KiB, stable scope-bound idempotency, retry limits, cancellation and redacted failures.
2. Add a host HTTP adapter with mandatory authentication and bounded requests. Plugins never receive Redis credentials. Use explicit Redis configuration; test against a disposable Redis, not another application's database.
3. Add local CLI create/validate/build/pack for the backend jobs template. Generate an independent first test extension using packed SDK/CLI packages outside the workspace. It uses actual HTTP calls and a real BullMQ Worker. Do not publish a release or claim production runtime support.
4. Verify isolation, altered idempotency payloads, delayed cancellation, worker-side revocation, failure/retry and unknown handlers. Update docs/schema/registry capability metadata and run a fresh-context review.

Ruling: PostgreSQL remains the production installation/grant authority. BullMQ owns plugin-job delivery. The new service requires host authorization/dispatch ports and exposes an HTTP adapter; production composition and the full container installer remain in the existing runtime plan. The first standalone fixture binds those ports explicitly and is labeled local integration, not production rollout.

Owner clarification: BullMQ must be part of Core itself. Core now owns Redis configuration and durable per-domain worker scheduling; Mail/Hosting/Storage and Billing workers use it directly. Existing PostgreSQL business-operation rows/leases remain authoritative and are drained by BullMQ dispatch ticks, preventing loss of in-flight operations. No parallel timer-polling worker remains. Deployment requires explicit Redis configuration.
