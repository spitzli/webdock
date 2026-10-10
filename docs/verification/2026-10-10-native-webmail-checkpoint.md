# Native Webmail implementation checkpoint

This is development evidence, **not a customer release or production rollout**.
The previous private-instance rollout remains documented separately in
`2026-10-10-native-mail-rollout.json`.

## Implemented

- Verified domain attachment, bounded mailbox creation, explicit access grants,
  provider configuration leases and readback. One user identity per customer;
  separate Group account per mailbox. Administrators have no implicit content access.
- Membership-incarnation binding and immediate application-side revocation.
  Re-adding a removed member cannot revive old mailbox grants or gateway sessions.
- One-use launch codes and 15-minute Webmail sessions. The dedicated gateway
  checks current authorization on every request and uses per-user credentials.
  No mailbox content or administrator credential is returned through Studio RPC.
- Fixed-account JMAP reads, paginated search, draft creation, message changes,
  independent Sent filing and a durable write journal. Ambiguous submission
  outcomes never permit an automatic second submission.
- Native Studio inbox/read/reply/compose views, folders, archive/trash, uploads and
  downloads. Attachment references must belong to the current upload session or
  selected message; maximum 10 MiB total outgoing attachments, maximum ten files.
- Sanitized HTML in an opaque sandbox with restrictive CSP. Remote images and
  active content remain blocked. Message HTML is never rendered in the Studio DOM.
- Restricted gateway image and tenant NetworkPolicy for gateway-to-JMAP only.

## Evidence

- Auth suite: 136 passing; Studio suite: 106 passing.
- Mail unit suite: 19 passing; real isolated CE suite: 8 passing.
- Agent unit suite: 52 passing and one opt-in integration skipped at the broad
  run; the opt-in restricted-container test passed separately.
- Auth, Studio and Mail TypeScript checks; Auth/Studio lint; catalog coverage pass.
- Real CE compose/read/reply, attachment byte roundtrip and Sent filing tested.
  Tests use disposable isolated networks and send no external mail.
- T3 browser component fixture: German inbox/reply, 390 px layout without horizontal
  overflow, no injected script execution, no attack canary requests, no unsafe
  elements left in sanitized content. Sandbox origin is opaque. Screenshot tools
  returned automation errors; DOM evaluation succeeded. This was a component
  fixture, not an authenticated end-to-end production test.
- Gateway container health passed with non-root UID 65532, read-only root,
  dropped capabilities and no external network. Node base pinned to digest
  `sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`.

## Stalwart findings affecting production

Pinned CE accepts a DATA hook that receives authenticated SASL context and the
SMTP envelope. The fixture proves explicit policy rejection and temporary SMTP
failure when the hook returns HTTP 503. Configuration readback alone did not
prove activation; the test explicitly restarts the isolated instance.

The relay fixture proves delivery through an explicit Relay route. The wire
representation of `Expression.match` is a keyed object (`{"0":{...}}`); an array
is rejected by this pinned build even though documentation describes a list.

**Unknown routes fall back to direct MX delivery.** The fixture and pinned source
confirm this behavior. Production must enforce an egress allowlist for approved
relay IPs and implicit-TLS port 465, with no direct TCP 25 access, and demonstrate
the negative case on the actual cluster before enabling outbound mail. A route
setting alone is insufficient.

Source: [Stalwart v0.16.25 route fallback](https://github.com/stalwartlabs/stalwart/blob/v0.16.25/crates/common/src/network/mta.rs),
[DATA hooks](https://stalw.art/docs/mta/filter/mtahooks/),
[JMAP message body and attachment semantics](https://www.rfc-editor.org/rfc/rfc8621.html).

## Still required before customer release

The common SMTP outbox/policy/budget path, managed and Enterprise BYOK relay
configuration, public ingress/TLS/DNS, native API keys/events/webhooks, forwarding,
app access, tested backup/restore, and complete Webmail synchronization/draft
editing remain unfinished. The initial Webmail UI also still needs CC/BCC,
reply-all/forward, inline images, autosave/state conflicts and full authenticated
browser-to-Stalwart verification.

Direct JMAP submission is only an explicitly enabled local test adapter.
Production gateway refuses it, and provisioned interactive identities have no
`emailSend` or `jmapEmailSubmissionCreate` permission. Customer sending must use
the common SMTP path from the architecture spec. `WEBDOCK_NATIVE_MAILBOXES_ENABLED`
remains disabled in production. No new Mail production credentials, routes,
customer DNS or mailbox content were changed by this checkpoint.
