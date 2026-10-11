# Native Webdock sending service

This is the outgoing-only implementation, behind `WEBDOCK_NATIVE_MAIL_SENDING_ENABLED`.
It is not a production release of the complete Mail product. Incoming-enabled customers
remain blocked until their Stalwart submission policy/relay configuration is ready.

Run the offline Auth native-Mail migration, configure Auth's `MAIL_API_ORIGIN`, and provide
the API process with `WEBDOCK_AUTH_ORIGIN`, the shared `MAIL_GATEWAY_SECRET`, the existing
`MAIL_ENCRYPTION_KEY`, and a dedicated private retained `MAIL_PAYLOAD_DIRECTORY`. Start
with `npm run api --workspace=@webdock/mail`. The same process runs the durable worker.
Do not use ephemeral storage or the public CMS blobstore. `Dockerfile.api` builds from
the repository root. Keep the feature flag false until infrastructure and accounts are ready.

An authorized administrator connects managed sending (after its existing sending account
and domains are verified), or selects an entitled existing BYOK connection, in Studio's
Mail → Webdock Mail sending. Webdock keys are shown once; provider credentials stay private.
A limited key stays limited if its domain is later removed.

`POST /v1/emails` uses `Authorization: Bearer wd_mail_…` and accepts JSON:

```json
{
  "from": "Support <support@example.com>",
  "to": ["recipient@example.net"],
  "subject": "Your request",
  "text": "We received your request."
}
```

Use a stable `Idempotency-Key` header when retrying the same request. An omitted key
creates a new submission; it cannot protect a client that retries after a lost response.
CC/BCC accept an address or address array. Optional `html`, `scheduled_at` (UTC ISO, up to
30 days), and `attachments` are supported. Attachments use `filename`, base64 `content`,
optional `content_type` and `content_id`; remote paths/URLs are rejected. Limits: 100 total
recipients, 10 attachments/10 MiB decoded attachment data, 16 MiB JSON request, and a
bounded final MIME message. At least one To recipient is currently required.

A 202 response has string `id` and queue `state`. `GET /v1/emails/:id` reads that key's
status; `DELETE /v1/emails/:id` cancels queued/preparing jobs. `accepted` means the next
transport accepted the message, not final delivery. `unknown` must not be retried as a
new message without reconciliation. No automatic resubmission occurs after handoff.

Per customer, the queue admits at most 1,000 unresolved jobs / 256 MiB of plaintext payloads.
Successful/definitely rejected handoff cleanup removes the payload. Unknown outcomes retain
it. Orphan and cancelled-payload cleanup is still a release gate; the disk free-space guard
stops new payload writes before exhausting storage. Receipt metadata and idempotency records
remain in PostgreSQL.

Local verification includes the real HTTP API, native key authorization, PostgreSQL,
encrypted files, worker and relay adapter with a fixture HTTP response. No real external
messages are sent by these tests. Real public delivery and the Stalwart/Webmail path remain
separate required integration checks.
