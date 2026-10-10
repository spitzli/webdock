# Vercel release health and Lunares push acceptance

The real Lunares production URL redirects `/` to application authentication, and its unique deployment URL redirects unauthenticated requests to Vercel SSO. Neither establishes an unhealthy application. Its existing `/api/health` endpoint returns HTTP 200 through the public `schattenclan-lunares.vercel.app` production alias.

Sources now configure a bounded same-origin health path. Release creation freezes it in `publication_target`; source edits cannot rewrite historical observations, and rollback retains the original snapshot. Existing releases retain `/` as their default. Observation requires HTTP 200, actual Frankfurt region metadata and exact project/release/prebuilt deployment identity.

If the unique URL is protected, health can use at most three provider-reported `*.vercel.app` aliases. Webdock checks the alias project, deployment, UID and update version before and after probing. It rejects changed/deleted/redirecting aliases, custom hosts, foreign deployments and redirects; no credential is sent to the health URL and Deployment Protection remains enabled. The actual integration credential can read both deployment aliases and the canonical alias record (HTTP 200 verified).

Validation: Auth suite 131 passed; observer regression tests cover configured path, historical fallback, alias reassignment/version/UID changes, rejected custom hosts, redirect/delete metadata and non-200 success statuses. Both Auth/Admin TypeScript checks pass. Studio catalog coverage was corrected to include the existing modular database catalog, matching the runtime compiler; six i18n regressions pass.

The preceding real bot push test is complete: Lunares main `7e9cf6ccf7f9360eac58e12d1a6cf5865e97bfd1`, GitHub run `38056315240`, Webdock build `102398975813881856`, release `102399141430169600`, hosting operation `102399177706704896`. Revision 22 reached `ready` automatically without reconciliation; desired and observed image match `sha256:b5a805f0dc0b6a9ee7208fdb7585b026a1c30c07a9fc732a20c65f8d20e08359`, with zero pod restarts.

Panel publication remains paused while this correction is deployed and its `/api/health` source setting is activated. No successful panel publication is claimed by this pre-rollout record.

Final Admin suite: 106 passed. Additive source health-path migration applied in production without changing worker enrollment. A subsequent bot workflow dispatch also completed automatically at app revision 23; the panel build was deliberately cancelled through source revision fencing before publication while this correction was being prepared.
