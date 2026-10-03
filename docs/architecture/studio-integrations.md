# Studio integrations

Studio is the operator workspace at https://studio.webdock.dev. Customer sites retain independent Payload applications and schema-scoped database credentials. Local Payload users are system-managed identity projections; native account screens and password authentication are disabled during enforced SSO.

## MCP

Connect an HTTP MCP client to `https://studio.webdock.dev/api/mcp`. The service implements stateless Streamable HTTP with JSON responses using the official TypeScript SDK. It does not offer a persistent SSE stream.

Register a client at https://auth.webdock.dev/connections while signed in as an operator with completed security setup. Supply the exact callback URL from the client. Public/native clients use PKCE without a secret; server clients can request a confidential client secret, displayed once. Dynamic anonymous registration is disabled. Every client requires user consent and an exact registered callback.

- `webdock:read`: `list_records`, `get_record` for customers, projects, CMS connections and activity.
- `webdock:write`: additionally `save_customer`, `save_project`, `save_cms_connection`, `set_archived`. Request both scopes for writes.

Writes share the Studio registry service and Payload access, validation, ownership and transaction-bound audit hooks. CMS connection changes edit inventory only. No tool deploys infrastructure, deletes content, reads credentials or manages identities. Snowflake IDs remain strings. Create operations are not idempotent; clients must not blindly retry after an ambiguous timeout.

The protected-resource discovery document is `/.well-known/oauth-protected-resource/api/mcp`. The issuer is `https://auth.webdock.dev/api/auth`; discovery is also available at its RFC 8414 path-insertion URL. Tokens must target the exact MCP resource. Native OAuth validation verifies PKCE, signature, audience linkage, expiration and current sessions; the resource introspection wrapper additionally reloads current operator/MFA/ban/setup status and registered MCP-client metadata. Disabling a client or signing out centrally invalidates access on the next request. Access tokens expire after five minutes; this initial version does not request offline access or issue refresh tokens.

The existing Studio confidential SSO client is linked to the MCP resource as its introspector. It cannot use ordinary SSO tokens as MCP tokens: they have neither the resource audience nor MCP-client metadata. Never copy the introspection secret into an MCP client.

## GitHub

The Spitzli-owned **Webdock Studio** GitHub App uses only repository Metadata read access. It has no code write permissions or webhooks. Its exact callback is `https://studio.webdock.dev/api/github/callback`; the installation setup page returns to `/integrations`.

Studio requires its own operator login before GitHub connection. GitHub OAuth uses PKCE and encrypted, short-lived state bound to that operator. The expiring GitHub App user token is kept in an encrypted, HttpOnly, host-only cookie for at most eight hours; no refresh token is retained. It is never returned to frontend JavaScript. Connect again after expiration.

Repository selection reloads the authorized installation and repository list from GitHub before saving the verified canonical repository URL. Removing GitHub installation access therefore prevents subsequent selection. Existing repository URLs remain ordinary project inventory; disconnecting GitHub does not delete them.

Configuration uses production-only `WEBDOCK_GITHUB_CLIENT_ID`, `WEBDOCK_GITHUB_CLIENT_SECRET`, and `WEBDOCK_GITHUB_APP_SLUG`. Cookie encryption derives a separate key from the Studio SSO cookie secret. The GitHub App private key is not needed or deployed by this user-authorized integration.

## Passkeys

Passkeys are enrolled and removed at https://auth.webdock.dev/account and can initiate central sign-in. They are scoped to auth.webdock.dev. Device PIN/biometric verification is required on both registration and assertion. Existing MFA remains required after passkey sign-in; recovery/password methods remain available. Payload never stores these credentials.

## Sources

- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Better Auth OAuth provider](https://www.better-auth.com/docs/plugins/oauth-provider)
- [Better Auth passkeys](https://www.better-auth.com/docs/plugins/passkey)
- [GitHub App registration](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)
