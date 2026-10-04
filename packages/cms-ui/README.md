# Webdock CMS

Shared content editing UI and access-controlled adapter for independent CMS instances.

Server contract: `handleCMSRequest(request, options, getPayload)` handles `/api/cms` (export GET/POST/DELETE wrappers). `cmsUser(payload, headers)` verifies the current instance session and returns a user with a supported CMS role or null. The app page redirects unauthenticated users through existing SSO before rendering `<CMSApp siteName siteURL accountURL accessURL technicalURL="/system" />`. Import `client.tsx` and `styles.css`. A client wrapper can supply `richTextEditor` for rich content.

Options: siteName, siteURL, explicit module allowlist `{slug,kind:'collection'|'global',label,titleField?,description?,previewPath?}`, locales/defaultLocale. Never include identity/system collections. Keep old `/admin` routes as redirects to `/cms`, and gate any technical `/system` fallback to `operator` before rendering upstream admin views.

Canonical source is this package. Standalone site repositories carry an identical vendored copy under `src/webdock-cms/` until a package publishing workflow is needed. Site adapters and rich-text components remain owned by their app.

Sync a standalone site with `node packages/cms-ui/sync.mjs /path/to/site-repository`, then run that site's typecheck and CMS browser suite. The source is vendored deliberately; no live cross-site dependency is introduced.

The CMS uses native access rules, validation, drafts, version history and media storage. Writes additionally verify same-origin requests, explicit modules/fields, current roles and the document timestamp inside a serializable transaction. Conflicts require reloading; creates are never automatically retried. Existing native fields/hooks remain authoritative and system/identity collections are not exposed.

The roles are Reader (view), Editor (create/edit/publish) and Administrator (also delete/restore). The operator remains platform-controlled. Apply `instance-kit.protectContent` to every collection/global so native REST calls cannot bypass the same rules. Version restoration is guarded in native beforeOperation hooks as well as the custom API. Versions, draft preview and upload actions are shown only where the configured site supports them. Globals without drafts explicitly save directly to the live website.

Unsupported or opaque fields are preserved rather than flattened. Rich-text editing is supplied by the site's existing editor dependency; incompatible node schemas remain read-only. `/system` is an operator-only compatibility escape hatch, including its metadata and server functions. This is not a new shared multi-tenant content database or a runtime collection designer.
