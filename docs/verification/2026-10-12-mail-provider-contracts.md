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

Use Node 24. Create a dedicated PostgreSQL instance exposing only `127.0.0.1:5438`, database `webdock_admin_test`. Put its URLs, a generated `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://localhost:3125`, `AUTH_TEST_MAIL=true` and `NODE_ENV=development` in ignored `apps/auth/.env.test.local`. No real SMTP/provider credentials belong there.

Run `npm run test:mail:setup -w @webdock/auth`, then `npm run test:mail -w @webdock/auth`. The setup rejects remote/non-test URLs and hosted environments before importing a database pool. It uses committed registry migrations and Better Auth migrations; existing tables are retained on a repeat run.

The Better Auth origin checks are intentionally exercised with NODE_ENV=development; its test-mode shortcuts would conceal CSRF regressions. The existing registry lock function is included in local setup for the full Auth suite.

## Explicitly authorized live BYOK pilot, 2026-10-12

The owner authorized `spitzli.me`, a separate new turboSMTP subaccount used as BYOK, and recipient `dominik@spitzli.dev` during implementation.

- Created account **26191165**, email `relaykit-byok-test-20261012@spitzli.me`; active, provider limit **10**. No existing customer's provider mapping or Stalwart instance changed.
- An internal Consumer pair with `SEND_API`/`APIS` was created through the exact child authorization. Its presence in that child's key inventory was verified. Credentials/password are encrypted in a private file outside the repository; no secret is recorded here.
- Registered sender domain **420309**, `spitzli.me`; provider returned SPF/DKIM/DMARC all `true`. No DNS records were written.
- Exactly **one** plain-text message was submitted with the new tested EU transport adapter at **2026-10-12T11:55:56Z**, from `relaykit-test@spitzli.me` to the authorized recipient.
- Provider accepted MID **2220893013169782784**, reference **cc5c3866-be90-4591-af4f-e90044c726bf**. Lossless numeric parsing preserves the full MID.
- Read-only provider analytics returned that exact ID and `SUCCESS` at **11:56:54Z**.
- Actual recipient inbox independently confirmed via the existing IMAP tool: INBOX UID **2216**, matching sender, recipient, subject reference and body reference.

This proves this controlled child account's identity, Consumer sending/management authentication, DNS readiness, EU submission, lossless MID and actual reception. It does **not** prove the future customer API, callback delivery/reference echo, generic external-BYOK self-identification, all recipient accounting cases, or the complete F01–F21 integration. No callback configuration was changed and no application was cut over.

Full Auth regression after environment setup correction: **162 passed, 0 failed** (Node 24.21.0, dedicated local PostgreSQL). This is a development checkpoint, not final plan acceptance.
