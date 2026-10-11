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
- Native Studio inbox/read/reply/compose views, CC/BCC, draft autosave/editing,
  folders, archive/trash, uploads and
  downloads. Attachment references must belong to the current upload session or
  selected message; maximum 10 MiB total outgoing attachments, maximum ten files.
- Sanitized HTML in an opaque sandbox with restrictive CSP. Remote images and
  active content remain blocked. Message HTML is never rendered in the Studio DOM.
- Restricted gateway image and tenant NetworkPolicy for gateway-to-JMAP only.

## Evidence

- Auth suite: 136 passing; Studio suite: 106 passing.
- Mail unit suite: 25 passing; real isolated CE suite: 9 passing.
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
app access and tested backup/restore remain unfinished. The initial Webmail UI also still needs
reply-all/forward, inline images, SSE/Changes synchronization and full authenticated
browser-to-Stalwart verification.

Direct JMAP submission is only an explicitly enabled local test adapter.
Production gateway refuses it, and provisioned interactive identities have no
`emailSend` or `jmapEmailSubmissionCreate` permission. Customer sending must use
the common SMTP path from the architecture spec. `WEBDOCK_NATIVE_MAILBOXES_ENABLED`
remains disabled in production. No new Mail production credentials, routes,
customer DNS or mailbox content were changed by this checkpoint.

## Additional draft and SMTP evidence

Draft replacement first creates and verifies the new message, then removes the
old version with a second state fence. JMAP set operations can partially succeed;
combining both actions could lose the last saved draft on quota failure. A
regression test covers that failure. Sending and replacement reservations exclude
one another, preventing a new draft ID from bypassing an uncertain send attempt.
The browser fixture verifies two successive autosaves using the prior draft ID.

The native single-attempt SMTP transport validates an instance certificate pin
before AUTH and distinguishes a known negative response from a lost DATA reply.
Four TLS fixtures pass, including no credential disclosure on a pin mismatch and
no retry after an ambiguous submission. The real CE transport test confirms one
received message. Assigned-agent completion can now persist the private SMTP
certificate fingerprint with its service revision; old agents cannot enable
sending without that proof. Actual restricted CE rejects interactive-user SMTP
AUTH and JMAP EmailSubmission/set. These transport pieces are not yet connected
to the required common submission queue and budgets.

## 2026-10-11: incoming/outgoing split and further local verification

The owner refined the topology: outgoing-only uses Webdock API → Turbo relay API,
without a Stalwart instance. Explicit incoming activation (including forwarding-only)
provisions one isolated CE instance and selects Webdock API → Stalwart → Turbo.
The existing native service registry now describes incoming infrastructure. The UI
labels activation accordingly; the deployed Spitzli instance and retained data are unchanged.

Recipient budgets no longer require a service row. Tests reserve exactly seven of
20 concurrent requests against a seven-recipient allowance without allocating any
instance. Each reservation records its send path; replay cannot change that path.
Pending, suspended or unverified incoming revisions cannot silently choose direct
sending. First incoming activation refuses outstanding direct-send reservations;
the customer lock serializes this transition against admission.

The new internal relay API adapter follows the [official send contract](https://serversmtp.com/turbo-api/turbo-smtp.yaml):
fixed regional HTTPS endpoints, consumer credentials kept server-side, bounded
request/response sizes, BCC preserved separately from sanitized MIME, exact 64-bit
message IDs, and one HTTP attempt. A lost or malformed acceptance remains uncertain.
Local fetch fixtures prove these properties; no real external email was sent.
**The adapter and budget primitives are not yet wired into a public send endpoint/outbox.**

Native domain configuration v2 creates Webdock DKIM keys and returns validated RSA
public keys for Studio DNS instructions. Existing active native keys are retained.
Pinned CE tests verify real signatures and reject a changed body. This does not prove
public DNS propagation or relay readiness. Private Mail pods no longer carry the
generic ingress label which would select the broad application ingress policy.

Local verification: Auth 137/137, Studio 106/106, Mail unit 32/32, real CE 10/10;
agent unit 52 passed plus one optional container test skipped, then that restricted
container test passed separately. Auth/Studio/Mail TypeScript and Auth/Studio lint
passed. The new activation/budget tests also passed after the full Auth run.
No production rollout or merge was performed for this checkpoint. Public reception,
forwarding, common durable sending, managed/BYOK credential binding and real authenticated
browser-to-mail-server verification remain required before customer release.

## 2026-10-11: durable native outgoing API

The outgoing-only path is now connected locally: a native Webdock key authorizes
`POST /v1/emails`; the dedicated Mail API validates/compiles MIME, stores an encrypted
private payload and atomically admits a PostgreSQL job with its recipient budget.
The worker rechecks the key, domain, transport revision, current allowance and BYOK
entitlement immediately before committing its handoff and calling the relay API.
`GET /v1/emails/:id` reports that key's submissions; `DELETE` cancels only before handoff.
The local HTTP integration exercises the real relay adapter with a fixture fetch response,
not an actual external provider delivery.

The queue supports scheduling up to 30 days, source-scoped idempotency, concurrent
workers, pre-handoff lease recovery, late receipt reconciliation and explicit unknown
acceptance. Unknown handoffs cannot be dispatched again. Quota downgrade and month
rollover are rechecked without double charging. BCC remains in the envelope only.
An unreadable stored payload is held for review before network handoff; its data and budget reservation are retained. The private volume has an encrypted key marker, so a wrong deployment key fails before processing or deleting stored mail.

Studio now has `/mail/sending` for native, hash-only API keys, optional domain scope,
revocation, and managed/BYOK connection setup. Managed provider keys have SEND_API only,
remain encrypted server-side and use a reservation before external creation; lost
creation responses require review. BYOK uses the existing entitlement and credential
revision and never falls back to managed sending. Deleting a restricted key's domain
cannot broaden that key. Once the new sending flag is enabled, legacy managed direct-key
creation is blocked; operators retain legacy inspection/revocation for migration.

The API has a standalone rootless image and uses a private retained filesystem;
Auth carries bounded metadata, not MIME bodies. The restricted local image started
successfully with read-only root, all capabilities dropped and no network, and returned
health 200. A component browser fixture verified native key creation, one-time synthetic
key display, German labels, absence of vendor branding and no overflow at 390px.
This is not a real authenticated Studio production test.

Verification: Auth 139/139, Studio 106/106, Mail 38 unit tests, two database tests,
and 11 pinned CE integration tests passed. The new CE test proves a separate principal
with only authenticate/emailSend can submit under an exact authenticated-as exception,
while JMAP mailbox reads and management access remain forbidden. This principal test
was isolated; it has not changed production Stalwart accounts.

**Still disabled for production:** `WEBDOCK_NATIVE_MAIL_SENDING_ENABLED=false` by default.
The incoming/Stalwart path is deliberately refused by admission until its private service
principal, DATA policy, verified relay and egress rules are connected. Webmail is not yet
connected to this outbox. Payload orphan/terminal cleanup, public DNS/TLS and deployment,
real authorized delivery, reception/forwarding and backup/restore remain release gates.
The existing private Spitzli instance and its retained volume were not modified.


## 2026-10-11: shared Webmail outbox and SMTP configuration v3

This checkpoint supersedes the earlier open items about Webmail queue integration,
SMTP configuration implementation and terminal payload cleanup. These are implemented
and locally tested; deployment and live operational proof remain outstanding.

- Webmail submission now uses the same staged encrypted outbox and recipient budget.
  Current explicit grants are rechecked before dispatch; browser logout alone does not
  cancel admitted intent. Sent filing is independent and repairable without resending.
- Configuration v3 escrows a send-only principal, per-instance policy token and
  persistent SMTP certificate. The DATA proof binds content, envelope, tenant and
  configuration revisions. Only one queue ID may consume a reservation.
- Managed private provider keys now request SEND_API and SEND_SMTP, without APIS.
  Browser gateway and worker control credentials are distinct and mutually scoped.
- Payload admission reserves metadata before writing, fsyncs before queue commit,
  expires abandoned staging and cleans known terminal files idempotently. Unknown or
  unreadable payloads are retained. AES-GCM rejects truncated tags and a volume key
  marker prevents operations with a wrong encryption key.
- Verification: Auth 141/141; Studio 106/106; Mail unit 42/42 and database 2/2;
  agent 56 passed plus one optional test skipped, followed by that real restricted
  container test passing separately; pinned CE 13/13. Type and lint checks passed.
  The HTTP/Auth/DB/encrypted-file Webmail test uses fake JMAP/SMTP peers. A separate
  real CE test proves scoped draft export, service SMTP and Sent filing.
- Browser component fixture: one submit, accepted receipt and Sent repair without a
  second send; no horizontal overflow at 390px. This is not production SSO evidence.

After the owner unlocked the SSH agent, read-only Contabo verification succeeded.
The node and Spitzli Mail pod are Ready, the retained 10-GiB PVC is Bound and the
hosting agent is active on the old `mail-d00d15c` release. Instantaneous node use was
about 17% CPU and memory. The observer's zero provisionable capacity and false generic
capabilities are hard-coded conservative defaults, not a failed network test.
The namespace has restricted Pod Security and deny/DNS/internal policies; policy
presence alone does not prove enforcement. Updated submission-isolation runtime
checks still need to run against the cluster.

Production still lacks the shared gateway/API deployment, configured Spitzli sending
account/domain/allowance and live end-to-end proof. Public reception, forwarding,
accounting for server-generated mail, native DKIM DNS verification and backup/restore
remain release gates. No production mutation or external mail occurred in this
checkpoint; the Mail encryption key and existing retained volume were preserved.

### Shared gateway preparation and owner-selected live test

The secret-free shared gateway renderer passed three tests for public-route allowlisting,
immutable images and browser/worker secret-volume separation. A Kubernetes client dry-run
on the actual Contabo node accepted all six resources; none were applied. Auth and Studio
production builds passed. Commits `b00348a` and `fcad367` are pushed to PR #5.

The owner selected **spitzli.dev with 100 outgoing emails per month** for customer
`99868132637671424`. This selection is not yet a configured account or subscription.
The current public MX points to Proton Mail; SPF already includes Proton and Turbo and
DMARC uses quarantine. Preserve the current receiving setup during sender verification.
The connected Cloudflare account exposes neither spitzli.dev nor webdock.dev, and the
collaborative Studio browser requires a new operator login. DNS access/manual record
setup and operator login have been requested. No live sender account, quota, DNS or
mailbox was changed at this checkpoint.


## 2026-10-11: final UI/UX review before merge

The native Mail flow now leads the page; ineligible managed customers do not see
an unrelated BYOK setup. Operators see that optional connection in a disclosure.
Mailbox/sending navigation follows the corresponding feature availability. Sending
setup distinguishes pending/review states, explains disabled key creation, keeps a
revoked BYOK selection explicit, provides one-time key copying and confirms revocation.

Webmail keeps the editor usable during autosave, warns before leaving with unsaved
changes, shows loading separately from empty folders and offers reconnection after
session loss. Draft editing waits for submission lookup and cannot edit an in-flight
submitted draft. The backend independently fences replacement and submission. Mobile
reading/composing uses a dedicated view with a return action and 44px controls.

Browser component proof at 390px and desktop: reply recipient correct; 88 samples
across delayed autosave kept the textarea editable; unsaved navigation cancel prevented
leaving; one queue admission and separately repaired Sent filing produced only one
send. Malicious message fixture produced zero remote-content canary requests. Native
key creation returned the expected tenant/domain action, copy succeeded, no vendor
branding or horizontal overflow appeared. These are synthetic component fixtures,
not live production delivery tests.

Fresh independent backend review found one merge blocker: generated Kubernetes probes
requested /healthz while the API served /health. The API now supports both paths. A
regression renders the actual manifest and calls all six startup/readiness/liveness
probes against the real API/gateway servers: observed 401 before the fix, 200 after it.
No remaining Critical/Important backend findings were reported. The reviewed feature
gates must remain off until operational proof. Local recipients still count toward
mailMessages; the separate external-recipient metric remains a release condition.

Verification after these changes: Auth 141/141, Studio 106/106, Mail 43/43 unit tests,
agent 56 passed plus one opt-in container test skipped; Auth/Studio/Mail typechecks,
Auth/Studio lint and both production builds passed. The earlier two database tests and
13 real CE tests remain the latest full protocol evidence; no protocol code changed in
this UI pass. The PR has no GitHub check jobs configured, so this evidence is local.
