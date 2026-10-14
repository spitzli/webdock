# Console browser domain

The browser application moves to `https://console.webdock.dev`. The existing Studio UI redirects with its full path and query. Public website links use Console.

## Compatibility boundary

`WEBDOCK_CONSOLE_ORIGIN` enables an exact browser alias after signed ingress validation. The API keeps `WEBDOCK_STUDIO_ORIGIN`, the SSO client registration, provider callbacks and MCP audience unchanged. Console requests are normalized to that protocol identity; foreign browser origins are rejected. Response redirects back to Studio become Console redirects, with session cookies preserved as separate host-only cookies. External provider redirects are unchanged.

The six registered GET login/callback endpoints on Studio redirect to Console before consuming their code/state. OAuth exchanges still use their original registered redirect URI. Legacy bearer APIs, MCP discovery and signed webhooks do not redirect. Cookies are not shared across subdomains; the first Console visit obtains a new application session through the existing central login. In-flight Studio login/integration flows should be restarted after migration.

`NEXT_PUBLIC_SERVER_URL` in the admin BFF remains the backend protocol origin. `WEBDOCK_CONSOLE_ORIGIN` in API/Auth is the public browser-link origin. Never replace the MCP audience or OAuth registrations merely to rename the UI.

## Rollout and rollback

1. Build/check the API and UI. Deploy the UI through the existing Git/Vercel pipeline.
2. Add Console's A record at the authoritative Vercel DNS to `178.104.141.95`. Add the exact Console ingress identity and route; the existing HTTP-01 resolver issues TLS.
3. Add a Console UI proxy server using the protected immutable admin deployment and forwarded Console host. Verify TLS before enabling redirects.
4. Set `WEBDOCK_CONSOLE_ORIGIN` in the API runtime and roll the API to the pinned image. Enable the Studio UI redirect and verify the complete browser login, deep links, origin rejection and legacy MCP behavior.

API image `sha256:cf89c824dc50b445384b9890e4c14db4366d03fca88a4dbe436f17a69d3f44fa` overlays the checked API artifact on the existing `sha256:7cef4b5c18a6360f4efd8b18da80b71c898a4eaebd92e876652b433679ddde17` runtime/dependencies (Bun 1.4.3). The prior runtime source differs only in the intended domain changes and formatting in database-orders. Worker, database schema, provider registrations and encryption keys remain unchanged. Images are imported into the existing k3s containerd store.

Rollback: restore the saved proxy/ingress configuration, remove the optional Console runtime variable, and restore the previous API image. No database rollback is required. Backups containing credentials stay outside Git.

Validation before release: 62 native API unit tests pass both locally and on Bun 1.4.3; 50 admin tests pass; API TypeScript check and admin production build pass. Domain tests cover exact-origin enforcement, callback query preservation, body bytes, multiple cookies, external redirects, legacy protocol endpoints and configuration rejection.
