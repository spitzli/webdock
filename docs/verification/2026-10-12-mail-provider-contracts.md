# Mail provider release evidence

Implementation environment: isolated `t3code/clarify-relay-kit-docs-work` worktree, Node 24.21.0, dedicated disposable PostgreSQL 17 on loopback port 5438. Existing developer databases and production were not modified. Tests use generated synthetic secrets and `AUTH_TEST_MAIL=true`.

## Evidence and outstanding release gates

| Contract | Evidence | Release status |
| --- | --- | --- |
| Child authorization and Consumer pair | Exact authorized child account/key inventory; two successful real deliveries | Proved for the BYOK pilot |
| BYOK real account identity | `GET /user/info` returns exact ID26191165 and active=1 | Generic binding implemented and locally isolated |
| SEND_API permission | Empty `{}` send probe: SEND_API/APIS400, APIS-only401, invalid secret401 | Non-delivering permission discrimination observed; temporary control key revoked |
| Parent versus child callback scope | No live scoped callback observed | Callback cutover blocked |
| Reference echo and 64-bit MID | Real MID2220893013169782784 and analytics exact match; reference submitted | MID proved; callback reference echo outstanding |
| Callback statuses | Official reference plus synthetic parser/projection fixtures | Live status matrix outstanding |
| Provider recipient accounting | Two messages to the same approved recipient delivered | Multi-recipient/billing equivalence unproved |
| BYOK tracking reads | `/tools`, `/tools/link_branding/domains_info`, `/tools/link_branding` all200 with bound pair | Read contract observed; no live tracking mutation |
| Callback configuration read | `/tools/webhook`500; aggregate tools reports webhook disabled on test account | No configuration contract inferred or changed |
| Minute scheduler | Suspended K8s template, authenticated production-only handlers | Not installed/enabled |
| Restore/load | Local restored messages/secrets and100k/1M metadata benchmark | Production restore and due-lag evidence outstanding |

No production application, callback, DNS record or existing Stalwart instance was
changed. The explicitly authorized live account and two-message test below are
separate from synthetic fixtures.

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

This proves this controlled child account's identity, Consumer sending/management authentication, DNS readiness, EU submission, lossless MID and actual reception. It does **not** prove the future customer API, callback delivery/reference echo, all recipient accounting cases, or the complete F01–F21 integration. The subsequent `/user/info` observation now supplies generic external-BYOK identity verification. No callback configuration was changed and no application was cut over.

Current local regression: **214 Auth tests passed**, plus **106 Admin tests passed**. Provider callbacks and the production pilot remain separate acceptance gates. The official [event reference](https://serversmtp.com/event-webhook-reference/) documents callback shapes; its example payloads are not live evidence for account scoping or reference echo.

## HTML/attachment pilot, 2026-10-12T17:14:57Z

A second explicitly scoped test used the same account, sender and authorized
recipient. MID **2220973297026318336**, reference
**07aaf2a0-e1df-4b1d-999d-d63f77c1dfdc** was accepted; analytics reported SUCCESS at
17:15:19Z. The recipient inbox contained it at UID **2221**. The existing mailsort
reader fetched only that message; instrumentation of its MIME parser compared the
attachment hashes without changing the mailbox tool or reading other messages.

[Received MIME evidence](2026-10-12-mail-product-mime-receipt.json) confirms HTML,
byte-exact text and PNG attachments, matching CID reference, normalized Reply-To
and the custom test header. The provider appended `@spitzli.me` to the supplied CID
local part. Supplying text and HTML yielded HTML without a separate plain-text
alternative; this limitation is documented in Quickstart. The first message
separately proved text-only delivery.

Total real test messages: **two**, both received by the approved address. No CC/Bcc
recipient, callback setting, DNS record or existing account was changed. This
still does not establish live callbacks or multi-recipient billing semantics.
