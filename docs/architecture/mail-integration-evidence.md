# Webdock Mail integration evidence

Date: 2026-10-10. Status: **local CE and managed-agent foundation verified; public delivery and the complete Mail product are not ready for production.**

Owner decision: [CE per customer with activated email](mail-deployment-decision.md). Reproduction: `npm run test:integration -w @webdock/mail` on the documented local Linux/Node 24 environment.

Initial verification: unit tests, real CE integration and TypeScript passed. Current agent verification is recorded below. An independent review identified Docker context precedence as a local-only guard bypass; two regression tests failed before the fix and now pass. Setup, child tests and cleanup all use the resolved, pinned local daemon.

## Verified

| Boundary | Evidence |
| --- | --- |
| Version/edition | Pinned `v0.16.25` digest in Compose; `/api/account` reports `community` |
| Isolation | Two independent config/data volume pairs, one internal network per instance; domains from A absent in B |
| Bootstrap | `x:Bootstrap/get`, `x:Bootstrap/set` through `/jmap`, explicit process restart, domain readback |
| Object encoding | `roles`, `permissions`, encryption settings use `@type`; credentials are keyed list objects, not ordinary JSON arrays |
| Account provisioning | `x:Account/set` creates a test user bound to its local `domainId`; account-level disk quota included |
| Authorization | Other instance's admin credential rejected; A's mailbox credential rejected by B; ordinary mailbox user cannot enumerate managed accounts |
| SMTP/JMAP | TLS submission on 465 accepts A's message; `Email/query` reads it in A, not B |
| Envelope policy | A's authenticated sender cannot submit with B's envelope address |
| Defensive adapter | Five tests cover unsafe endpoint config, redirects, mismatched JMAP responses, per-object errors, timeout without retry, and a streamed oversized response |

Stalwart's local account IDs are not globally unique. In the inspected deployments the domain had ID `b` and the mailbox account ID `c` in both instances. These are observations, not constants the application may depend on.

A Docker idle snapshot of two bootstrapped instances with a test account reported approximately 85.2 MiB each and 0% CPU. No production mail corpus, real spam feeds, attachments, search workload or concurrency was present. Do not use this point observation as a loaded capacity target.

## Still unverified / not implemented

- Real Kubernetes rollout of the new agent profile, admission/network integration, production monitoring and operator reconciliation UI. Activation registry/UI, capacity reservation and typed agent orchestration are now implemented and tested locally.
- Public recipient-aware SMTP ingress, instance routing for client protocols, production TLS and relay egress rules.
- TLS relay to Turbo, BYOK credentials, exact downstream event correlation and webhook reconciliation.
- Visible From-header policy; the passing SMTP test covers the envelope only.
- Shared monthly budgets across every path, including JMAP, forwarding and server-generated notifications.
- Better Auth → Stalwart OIDC, revocation, shared mailboxes, native Webmail and attachment safety.
- Forwarding/SRS/DMARC compatibility, production spam/malware handling, restore and load tests.

No claim of those remaining gates passing is implied by the local tests. In particular, a created CE `Tenant` object does not demonstrate Enterprise isolation, and Stalwart queue acceptance does not demonstrate Turbo or final-recipient delivery.

## Managed-agent verification (2026-10-10 continuation)

- Auth tests: **94/94 passed**, including activation, capacity races/retained storage, tenant-preview restrictions, assigned-cluster claim/checkpoint/completion, agent-generation fencing and duplicate completion rejection.
- Hosting agent: **35 tests passed, one opt-in Docker test skipped in the normal suite**. The real Docker test was run separately and passed.
- Real restricted-container test: pinned CE derivative runs as UID/GID 65532, read-only root, no capabilities; bootstrap to permanent credentials; explicit private listeners 8080/2525/2465/1993; health checks before/after bootstrap; normal administrator verified and temporary administrator rejected after restart. Data survives container recreation; TLS SMTP submission answers EHLO on port 2465.
- Auth and Mail TypeScript checks pass. The full Auth suite required the baseline tenant-preview schema in the dedicated disposable local PostgreSQL database; no production DB configuration was copied.
- Credential checkpoint, final instance registration, lifecycle completion and resource accounting are transactionally fenced. New agent registrations cannot continue old leases. Unknown external writes are not replayed.
- `MAIL_MANAGED_CLUSTER_ID` selects the existing platform k3s cluster. Docker worker execution is explicitly restricted to local integration mode.

These checks do not establish a real Kubernetes rollout, public TLS/SMTP ingress,
provider relay delivery, backups/restores or a complete user-facing Webmail flow.
No new Mail resources have been created on the production Contabo node.

## Review corrections

An independent review found two concrete agent defects. Both were reproduced
with failing tests and corrected: first storage allocation now works even when
activation intent reached revision 3 before any provisioning, while existing
instances retain the missing-disk protection; unsafe optional Mail configuration
now suppresses only the Mail capability and does not interrupt ordinary hosting.
The shared storage adapter preserves the actual Kubernetes resource revision.
