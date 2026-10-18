# Public Core release implementation plan

> **For agentic workers:** Use superpowers:executing-plans for coordinated execution and an independent release review.

**Goal:** Publish a verified, signed Linux AMD64 developer alpha with separate product-free Core images and a reproducible selfhosting guide.

**Architecture:** Extend the existing OCI manifest/build/native-verification/signing workflow with `api-core` and `console-core`. Preserve the full artifacts for installations with retained products; Core Compose selects only the small runtime. Keep production configuration unchanged during packaging.

**Spec:** The owner requested a public release, explanation for selfhosters and an accurate audit of their current live configuration. Earlier explicit decision retains mixed auth until a separate Clerk cutover.

**Global constraints:** No secrets in artifacts or logs; clean committed build source; native AMD64 checks; signed checksums and pinned image identities; no unsupported ARM64 claim; no weakening TLS, MFA, tenant authorization or signature verification. Billing/CMS remain disabled in production. No destructive registry lifecycle smoke test.

- [x] Read live auth/module/plugin state: Better Auth globally/OAuth, native Clerk Console; four products plus two ready external plugins; Billing/CMS disabled with retained metadata.
- [ ] Extend required image inventory and native checks for Core artifacts. Reject missing/tampered artifacts in manifest tests.
- [ ] Repair Compose verification and add minimal Core Compose; rehearse a fresh installation with generated fixture credentials.
- [ ] Build from a clean revision on an ephemeral EU runner, sign with GitHub OIDC/Sigstore, verify signatures and checksums locally.
- [ ] Publish developer alpha `0.1.0-alpha.1`; verify anonymous download of exact release artifacts and any published registry references.
- [ ] Publish selfhosting prerequisites, initialization/configuration/upgrade steps, limitations and measured runtime/image sizes.

**Review focus:** Empty-database initialization; private owner/runtime credential separation; reverse-proxy origin/CSRF behavior; wrong architecture or unsigned artifacts; product-free runtime versus retained database schema and optional full products.
