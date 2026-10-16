# Navigation and viewer latency — second pass

Goal: materially reduce the remaining ~2.4 s navigation and ~7 s viewer startup, without caching authorization across requests.

Continue the existing isolated performance worktree and preserve all previously deployed fixes and independently released mail/schema-preference changes.

- [x] Measure database RTT and browser long tasks; distinguish I/O waits from JS execution.
- [x] Replace navigation-only full tenant data with already-authorized tenant summaries; retain preview restrictions and status/role checks.
- [x] Overlap managed database permission and project reads, retaining React request sharing.
- [x] Replace the four project-overview API calls with one narrowly scoped, fully authorized summary command and bounded SQL reads.
- [x] Disable unused automatic session JWT headers and remove the identical extra user lookup only after native session verification; retain OIDC JWT signing and revocation/MFA tests.
- [x] Overlap independent Tabularis driver/probe and schema/preference reads; retain failed-probe boundaries, filtering and cancellation.
- [x] Reuse the already-preloaded Runtime component without an extra Suspense retry; preserve editor identity if preload completes late, remove the redundant host lazy wrapper.
- [x] Run affected suites, build locally, prepare Vercel output with the existing required script, check candidates before switching, and repeat production timings.

Evidence: warm SQL SELECT1 roundtrips8–11 ms; representative viewer trace has only one80 ms long task. Metadata calls cost~0.3 s each. Local overview probe counted74 SQL statements across four requests before their additional authentication wrappers. No customer SQL writes for verification.

Completed and deployed; see docs/verification/2026-10-15-performance-round2.md and matching JSON.
