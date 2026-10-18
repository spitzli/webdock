# Managed Analytics pilot

Operator-managed pilot, live on 2026-10-17. The owner selected Umami instead of Plausible/Matomo, specifically to keep PostgreSQL and avoid a second database engine. The product must be an external ElysiaJS plugin, with its own declared API endpoints and MCP tools. Webdock's public homepage must use this same plugin flow.

## Provisioned provider

- Public origin: https://moon.webdock.dev
- Umami 3.4.0, image `ghcr.io/umami-software/umami@sha256:85909afc45bdcda1917394594a087421fdbb05610fded0fa9f6fb861abb2f367`.
- Workspace Webdock `103216044377636864`, existing platform project `103216298636345344`.
- Application `104989664116477952`, setup `104987369354039296`, namespace `wd-103216298636345344`, Service/Deployment `app-104989664116477952`.
- Resources: 1000m CPU, 1 GiB memory, 512 MiB ephemeral storage. No persistent app volume; data resides in PostgreSQL.
- Database and restricted login `webdock_analytics` on existing CNPG installation `103217546630533120`, namespace `wd-db-103217546630533120`.
- Strict TLS via mounted/generated CA file `/tmp/postgres-ca.crt`; `sslmode=verify-full`, no TLS bypass.
- Auxiliary database entry appended to `/etc/webdock-postgres.json`; registry entry retained. Main database CONNECT denied for the analytics login.
- Infrastructure: `infra/analytics/runtime-infrastructure.json`. DNS uses existing Vercel zone, not Cloudflare.
- Operator credentials, database credentials and provider project credentials are mode-0600 files under `/home/newt/.cache/webdock-analytics/`. Never commit or log them.
- Umami's default admin login was changed and verified rejected before public ingress was applied.
- Dedicated non-admin provider user `ccf8ba4b-4373-419f-8d6d-53baf5476404` belongs to the Webdock platform project. Its API key is for host-owned HTTP binding only; never pass it to the plugin or iframe.
- The operator custom hosting allowance was expanded from Registry-only to Registry & Analytics: two apps, 2 CPUs, 1.5 GiB memory, 768 MiB ephemeral, retaining the existing 1 GiB volume allowance. No external order or database purchase was added.

## Image preparation

The hosting agent intentionally sets `imagePullPolicy: Never` for arbitrary images. Initial placement on wd-eu-03 failed because the reviewed Umami image was absent. Three transient, unprivileged operator preload pods pulled the exact digest on wd-eu-01/02/03. The application subsequently became healthy. Native hosting start operation `105012931137114112` succeeded at 20:45:35 UTC, reconciling the application at revision 2. The replacement pod is ready with zero restarts, and all three preload pods have been removed. Do not weaken the agent image policy.

## Plugin delivery boundary

The separate local source is `/home/newt/Projekte/Personal/spitzli/webdock-extension-managed-analytics`. Its CLI-scaffolded manifest declares configuration, provisioning and stats actions plus API routes and MCP tools. The production host adapter now runs the verified external plugin. The live-result section below records the separate installation, Console provisioning and homepage collection proof.

The pilot covers verified installation, restricted TLS runtime, shared action dispatch, real project provisioning and homepage collection. Custom domains use the operator verification/routing workflow; no customer custom domain has been activated or claimed as end-to-end verified.

## Next requested plugin

After analytics: Managed Registry using Tabularium, with the existing Webdock registry as its first real user. Include domain, branding, kinds, manifest schema and GitHub integration.

The API cluster at `178.104.141.95` now has cert-manager 1.21.2 in `kube-system`, alongside its other infrastructure controllers. Its application admission policy intentionally disallows Kubernetes API tokens outside that namespace. No admission-policy rule was changed. The first unused `cert-manager` namespace was removed; webhook CA injection was updated to the actual system namespace. Controllers have bounded CPU, memory and ephemeral resources.

`infra/analytics/plugin-infrastructure.json` creates the restricted `webdock-plugins` namespace, quota, default-deny policy, namespace-scoped CA issuer and generation-specific runtime certificate. The public UI DNS `analytics.plugins.spitzli.dev` points to the API cluster through the existing Spitzli Cloudflare zone; no nameservers were changed. UI traffic is kept on a separate registrable domain from Webdock authentication.

During the API rollout, an additive egress policy unintentionally isolated the previously egress-unrestricted Core API and blocked database DNS. That new policy was removed, restoring the previous Core API networking. Plugin workloads retain default-deny egress and their narrow host/UI rules. The committed plugin network manifest does not change Core API egress policy.

Production database migrations 0040–0045 and the matching forced-RLS policies were applied with the temporary non-superuser offline migrator, then legacy installation state was initialized without changing the effective built-in selection. The first provider reconciliation test exposed Umami's non-admin missing-resource behavior (401 instead of 404); the plugin's follow-up release creates its deterministic website first and reconciles failed/lost responses through an owned-resource lookup.

Migration cleanup preserves the existing website-browser membership under the database administrator grantor before removing the temporary migrator's dependent grant. The offline role is then returned to NOLOGIN/NOCREATEROLE, its password removed, role memberships revoked and its temporary HBA rule removed.

## Live result, 2026-10-17

- Active plugin release: `0.1.0-alpha.3`, generation 3, Service `managed-analytics-g3`, ClusterIP `10.43.141.238`, image `ghcr.io/spitzli/webdock-extension-managed-analytics@sha256:515325955be99feb42a3ef5c92ebf3040c544e8f5b0cda7d03d15e02556d2cbf`.
- Registry JWS verified against established key `5d8025c66487bb44`; descriptor bytes equal the signed manifest. Explicit grant is only for project `103216298636345344`.
- Real Console provisioning produced website ID `bcaa0d24-4739-5576-aad1-f328ca6f8ac9`. Main-page tracking uses `https://moon.webdock.dev/script.js`, as explicitly selected by the owner. No custom domain was activated for the homepage.
- Production homepage deployment: `dpl_36kkvbXf1HYmh9h7YgB1qsDV3jTX`, `webdock-goiyot646-spitzli.vercel.app`. Tracker restricted to `webdock.dev,www.webdock.dev`, query/hash excluded, DNT respected; no session replay or heatmaps enabled. Privacy copy updated in English and German.
- Console deployment: `dpl_HEiv9qDBahG8gV848DGiP9vMeiuN`, `webdock-admin-3a9qij551-spitzli.vercel.app`; private UI proxy upstream updated while preserving auth upstream and protection credentials.
- Real browser visit to `https://webdock.dev/` loaded the script and sent `/api/send`; authenticated provider stats returned one visitor, one visit and one page view.
- Core API image: `docker.io/library/webdock-api@sha256:3c2db62dbb3173cdc727159ea382ff7c3fa1c0541bee5dda31bd326e156633c6`. Existing worker image was not replaced; this pilot uses data and HTTP capabilities, not production plugin jobs.
- Release webhook `699608811` configured manually using the registry's existing per-plugin secret; shared GitHub App permissions unchanged. Alpha.3 was ingested through the release webhook.

## Pilot operating limits

Custom tracking domains are configured per project through `publicConfiguration[PROJECT_ID].tracking_origin` in the host runtime Secret. Use the plugin repository's DNS verification/routing planner; refresh the full provider-cluster ingress inventory immediately before applying and refuse another resource's hostname. Confirm TLS readiness, successful script/collection requests and rejection of administration paths before setting the override. Domain provisioning is operator-managed, not customer self-service.

cert-manager renews the private runtime certificate Secret. Restart the corresponding plugin Deployment after renewal so its Elysia TLS listener loads the renewed certificate; monitor certificate expiry. There is no automated full plugin lifecycle controller in this pilot. A future controller must own rotation, draining and workload verification.

The operator install/update scripts preserve retained documents and grants. Runtime health identity is verified over TLS, and the operator must independently compare the Kubernetes image digest with the signed manifest. Database runtime state alone does not prove a workload stopped: wait for the old generation's pods to be deleted before staging its replacement.

Production frontends were deployed from a clean archive of the previous production source with only the plugin panel/homepage/privacy changes overlaid. This avoids deploying the branch's unrelated monorepo path migration. Source changes and documentation are retained in the current Webdock worktree; merging/publishing that broader branch is separate.
