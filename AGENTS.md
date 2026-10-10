<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Mail deployment decision

The owner selected Stalwart **Community Edition, one isolated instance per customer with explicitly activated email**, on 2026-10-10. Do not provision Mail for every new customer/project. Deactivation retains data; deletion is a separate operation. Follow `docs/architecture/mail-deployment-decision.md`; this supersedes the earlier shared-Enterprise recommendation. Webdock Mail and Webmail remain native; Enterprise BYOK is a Webdock entitlement independent of the Stalwart edition.

Managed Mail belongs on the existing Webdock Kubernetes/Contabo cluster (owner confirmation 2026-10-10). Reuse hosting-agent security/operations; Docker is the isolated local test backend, not the production control plane.
