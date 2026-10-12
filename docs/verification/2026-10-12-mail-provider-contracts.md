# Mail provider release evidence

Implementation environment: isolated `t3code/clarify-relay-kit-docs-work` worktree, Node 24.21.0, dedicated disposable PostgreSQL 17 on loopback port 5438. Existing developer databases and production were not modified. Tests use generated synthetic secrets and `AUTH_TEST_MAIL=true`.

## Evidence and outstanding release gates

| Contract | Available evidence | Release status |
| --- | --- | --- |
| Child authorization and Consumer pair | Existing `turbosmtp.test.ts` and prior `platform-mail.md` evidence | Adapter tested; sending permission still requires controlled account verification |
| BYOK real account identity | No sanitized authoritative account response supplied | Block new connection activation until verified |
| Parent versus child callback scope | Not observed here | Block callback cutover |
| Reference echo and 64-bit MID | Synthetic parser fixtures only | Block sending pilot pending controlled observation |
| Callback status aliases | Spec references REPORT/UNSUBSCRIBED; synthetic examples | Live confirmation outstanding |
| Provider recipient accounting | No controlled single/multi-recipient run authorized | No equivalence/billing guarantee |
| Minute scheduler | Existing K8s available; no scheduler enabled | Deployment decision/verification outstanding |
| Restore and isolated preview | Dedicated local test DB exists | Production restore/preview evidence outstanding |

No provider account, key, callback, DNS record or real message was created by this test setup. Synthetic fixtures must never be described as a successful live provider test.

## Local reproduction

Use Node 24. Create a dedicated PostgreSQL instance exposing only `127.0.0.1:5438`, database `webdock_admin_test`. Put its URLs, a generated `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://localhost:3125`, `AUTH_TEST_MAIL=true` and `NODE_ENV=test` in ignored `apps/auth/.env.test.local`. No real SMTP/provider credentials belong there.

Run `npm run test:mail:setup -w @webdock/auth`, then `npm run test:mail -w @webdock/auth`. The setup rejects remote/non-test URLs and hosted environments before importing a database pool. It uses committed registry migrations and Better Auth migrations; existing tables are retained on a repeat run.
