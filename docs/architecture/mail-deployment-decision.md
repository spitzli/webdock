# Mail deployment decision

Status: selected by the owner on 2026-10-10; implementation started, not deployed.

## Binding decision

Use **Stalwart Community Edition with one isolated instance per Webdock customer whose email service is activated**. Multiple domains and mailboxes of that customer use that same instance. Do not create an instance merely because a customer, project, domain, or CMS exists.

The customer's `mailEnabled` desired state starts false. An explicit activation requests provisioning; only verified provisioning makes the service ready. Keep desired activation, operation progress, and observed readiness separate. Repeated activation must reuse the same instance reservation. Platform-wide Mail suspension does not allocate or delete instances. Deactivation suspends the service and retains its data; retirement/export/deletion is a separate explicit lifecycle operation.

Each instance has its own configuration, data store/volume, credentials and network boundary. Instances may share an infrastructure host. No shared Stalwart CE directory or data store is used to emulate Enterprise tenancy. Webdock Studio, the public Mail API and worker code are shared. Application traffic is resolved against the server-side customer-to-instance registry, never a client-provided backend address.

Managed customers use the native Webdock Mail paths and an internal Turbo subaccount. Enterprise BYOK entitlement is a Webdock product capability and does **not** require Stalwart Enterprise. BYOK customers can use their own Turbo via their instance or use direct Turbo for their own applications. Hosted mailboxes always obey Webdock's service rules.

Public SMTP reception cannot be routed by TLS SNI alone: the receiving domain appears in SMTP `RCPT TO`. A shared ingress needs recipient-aware routing and handling for a transaction containing recipients from different customer instances. Submission/IMAP need authenticated-account routing or dedicated instance endpoints; JMAP/DAV can use per-instance Webdock hostnames. This topology is an integration gate, not an assumed capability of an ordinary HTTP reverse proxy.

## Production placement

The owner confirmed on 2026-10-10 that Managed Mail runs on the existing **Webdock Kubernetes cluster**, currently with one Contabo node. Read-only SSH verified node `vmd208517`, k3s `v1.36.5+k3s1`. The local `webdock-byok-test` kubecontext is an unrelated/unreachable local fixture, not this production cluster.

Production must reuse the existing Webdock hosting-agent authorization, lease, ownership, resource reservation and retained-storage boundaries. DockerMailRuntime is a local integration adapter, not the production deployment path. Respect the installed Restricted Pod Security, read-only root filesystem, positive resource budgets, ClusterIP-only services and default-deny networking. The official image has a file capability; the restricted runtime image must remove it and use explicit high ports. No new production resource has been created during this read-only inspection.

## Cost comparison, not a changed decision

The official Enterprise price page checked on 2026-10-10 lists EUR 2 per mailbox per year for the 25–499 tier, with a minimum subscription of 25 mailboxes (EUR 50/year). Higher tiers use progressive rates. User and group mailboxes count; aliases and mailing lists do not. Hardware/hosting remains separate. Monthly billing exists, but the published annual rates divided by twelve are only monthly equivalents, not a verified monthly checkout quote. [Pricing](https://stalw.art/pricing/)

Retain a customer-to-deployment mapping so a later Enterprise migration is possible. Do not buy a license or switch architectures on the basis of this comparison without an updated owner decision.

## Effect on existing planning

This decision supersedes the shared-Enterprise recommendation in the initial design. Integration tests use two independent CE installations, not two Enterprise Tenant objects. Enterprise-only history, tenant quotas, SCIM, branding and restore features are not implementation prerequisites. Product usage/history is owned by Webdock; backups and per-account quotas use CE-compatible mechanisms.

The integration gate must measure idle and loaded resources per instance, verify real cross-instance isolation, and establish CE-compatible event reconciliation. It must not depend on Enterprise History when callbacks are missing. Full Webmail remains part of the first customer release.
