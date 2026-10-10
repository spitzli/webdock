# Lunares Actions-to-production acceptance and readiness timeout

On October 10, 2026, the installation owner accepted GitHub Actions read access.
Lunares source configuration was enabled through Studio for `main`,
`.github/workflows/production-build.yml`, and artifact prefix `lunares-bot`, with
automatic publication. This supersedes the bot activation prerequisites recorded
in [the earlier Actions verification](2026-10-10-github-actions-artifacts.md).
Panel deployment consent remains a separate requirement.

## Observed production result

[GitHub Actions run 38055406407](https://github.com/paulhubacek1-afk/Lunares/actions/runs/38055406407)
built commit `dbf5a612`. Webdock imported build `102395458470547456`, published
release `102395648388632576`, and dispatched hosting operation
`102395686745542656` for application revision 21. The OCI manifest identity was:

```
127.0.0.1:5443/customers/101711682211938304/projects/101713101337919488@sha256:7cc82319c4b790fa61d630c39ab0ebaedf4878d6c592481a8809943fd50875f3
```

The live registry pull took 5.545 seconds. Kubernetes started the new container at
13:25:19 UTC. Discord API rate limits delayed cog initialization; the bot API
started at 13:26:09 UTC and Discord connected at 13:26:10 UTC. Kubernetes then
reported deployment generation 21 observed, one available replica, the expected
immutable image, and zero container restarts.

The executor reported a rollout timeout at 13:25:51 UTC because its readiness
window was only 55 seconds. The hosting operation and Git release correctly
entered reconciliation instead of automatically publishing again. The operator
used canonical `apps.reconcile` on the **same** operation; its unchanged revision
was observed successfully. Canonical Git release reconciliation then marked the
release ready (release revision 6), with application revision/observed revision
21/21 and `https://api.schattenclan.de/healthz` returning HTTP 200. Recovery did not
republish an artifact or manually patch the application spec.

Therefore the actual Actions → verified artifact → private registry → restricted
application deployment flow passed, **with one explicit reconciliation required**.
This is not evidence of an uninterrupted automatic rollout with the new timeout.

## Prevention change and local verification

The follow-up coordinates all three budgets:

- Managed apply readiness: 180 seconds, including Recreate termination and image
  pulling before application startup.
- Both node-local and SSH executor subprocesses: 260 seconds, allowing preparation
  plus readiness observation.
- Canonical hosting operation lease: 300 seconds, leaving result-reporting margin.

Ownership, revision, expiry checks and finite waits remain active. Deletion keeps
its existing separate 55-second wait. No provider credential or source execution
boundary changes.

Five regression tests failed against the old code, then passed: delayed readiness
at 90 seconds after apply returns the real executor proof; an unready deployment
stops at 180 seconds; an earlier lease expiry stops execution; and both executor
transports can carry preparation plus the full readiness wait. Tests use a fake
clock and no real sleeping. An Auth integration assertion verifies a fresh
300-second operation lease, and existing expired/stale lease rejection remains
covered.

Validation on the follow-up branch: 36 hosting-agent tests passed; 15 Auth hosting
and Git deployment tests passed; Auth TypeScript check and Python compile checks
passed. A fresh live end-to-end run with the revised budgets is still pending
review, merge and coordinated control-plane/agent deployment.
