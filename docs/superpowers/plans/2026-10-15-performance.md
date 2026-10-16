# Production latency fixes

Goal: reduce the measured Console navigation (~4 s) and managed database viewer startup (~13 s), and verify Dragonfly is operational and actually used.

Scope: preserve live authorization, tenant isolation, immediate revocation on subsequent requests, and the existing deployment architecture. No cross-request authentication cache. Work starts from origin/main e6b20dd in an isolated worktree.

- [x] Console: reproduce redundant and serial data reads; request-scope deduplicate safe reads and overlap independent context requests. Verify no mutation caching, no rejected-promise leaks, and no unhandled speculative reads. Tests and production build.
- [x] API auth: remove redundant introspection inside one authenticated request and avoid unnecessary public-network loopback while preserving client/subject/session binding and native service authorization. Regression tests for revoked, forged, mismatched and expired credentials.
- [x] Database gateway: reproduce startup RPC burst; share only concurrently in-flight inspections per session, retaining fresh inspection on subsequent requests and fail-closed cleanup. Test revocation, failure, independent sessions, and expiry.
- [x] Infrastructure/cache: inspect running API/cache/database/gateway resource usage, verify Dragonfly auth and cache hits. Reuse existing private deployment if healthy; configure missing wiring or deploy if absent. Review presentation-only cache uses.
- [x] Viewer bundle: inspect actual startup chunks and safely preload what is needed while session is negotiated; avoid changing vendored Tabularis without evidence.
- [x] Integrate, run focused and affected-suite checks, review security boundaries, deploy only locally/EU-built artifacts with rollback retained, repeat browser timing measurements.

Verification focuses: session revocation during concurrency; cache isolation and errors; mutation freshness; gateway expiry/logout while inspection is pending; unavailable cache fallback. No customer SQL writes or schema changes for testing.

Implementation and production verification: docs/verification/2026-10-15-performance.md and matching JSON. Viewer startup is improved, still not instantaneous; timings are single samples rather than load-test guarantees.
