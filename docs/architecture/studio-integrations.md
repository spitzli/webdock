# Studio integrations

Studio is the operator workspace at https://studio.webdock.dev. Customer sites retain independent Payload applications and schema-scoped database credentials. Local Payload users are system-managed identity projections; native account screens and password authentication are disabled during enforced SSO.

## MCP

Connect an HTTP MCP client to `https://studio.webdock.dev/api/mcp`. The service implements stateless Streamable HTTP with JSON responses using the official TypeScript SDK. It does not offer a persistent SSE stream.

Register a client at https://auth.webdock.dev/connections while signed in as an operator with completed security setup. Supply the exact callback URL from the client. Public/native clients use PKCE without a secret; server clients can request a confidential client secret, displayed once. Dynamic anonymous registration is disabled. Every client requires user consent and an exact registered callback.

- `webdock:read`: `list_records`, `get_record` for customers, projects, CMS connections and activity.
- `webdock:write`: additionally `save_customer`, `save_project`, `save_cms_connection`, `set_archived`. Request both scopes for writes.

Writes share the Studio registry service and Payload access, validation, ownership and transaction-bound audit hooks. CMS connection changes edit inventory only. No tool deploys infrastructure, deletes content, reads credentials or manages identities. Snowflake IDs remain strings. Create operations are not idempotent; clients must not blindly retry after an ambiguous timeout.

The protected-resource discovery document is `/.well-known/oauth-protected-resource/api/mcp`. The issuer is `https://auth.webdock.dev/api/auth`; discovery is also available at its RFC 8414 path-insertion URL. Tokens must target the exact MCP resource. Native OAuth validation verifies PKCE, signature, audience linkage, expiration and current sessions; the resource introspection wrapper additionally reloads current operator/MFA/ban/setup status and registered MCP-client metadata. Disabling a client or signing out centrally invalidates access on the next request. Access tokens expire after five minutes. Clients explicitly registered for remote work can request `offline_access` for rotating refresh tokens; see the remote-work section below.

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

## Remote work from T3 Code on Android

The agent and its MCP client run on the connected computer; the phone controls the conversation. An Android browser session is separate from the agent's desktop browser session. Use MCP/API for registry work and Playwright for unattended browser checks when the T3 preview host is unavailable. Complete any interactive sign-in, MFA, passkey ceremony or GitHub consent in the agent's shared browser at the PC. Never copy a personal password or MFA secret into a test script.

Register a client at the Connections page using the exact callback supplied by the MCP client. Enable registry changes if needed and **Allow automatic token renewal for remote work** for longer sessions. Request `webdock:read webdock:write offline_access` (omit write for read-only clients) and resource `https://studio.webdock.dev/api/mcp`. Authorization still requires PKCE and explicit consent. Existing registrations retain their original grants; register a new remote-work client rather than assuming an old client has refresh access.

Access tokens last five minutes. Opted-in clients receive rotating refresh tokens with an eight-hour lifetime. Store credentials in the MCP client's credential store on the host, replace the refresh token after every exchange, and serialize renewal requests: reuse of a rotated token is rejected. Refresh cannot expand permissions or resources. Central sign-out, account restrictions and disabling the client invalidate resource access; reconnect interactively when the session or refresh token expires. Disabling a client also prevents renewal.

Available remotely: customer/project creation, editing and archive/restore; deployed CMS inventory creation/editing; filtered and paginated reads; related records and audit activity. CMS provisioning, editing website content, identity administration and a persistent GitHub credential API are not included. GitHub account connection and verified repository selection continue through Studio's browser workflow.

### HTTP registry API

The API is another interface to the same Webdock registry resource and accepts the same OAuth bearer token and scopes as MCP. It never accepts a browser cookie as API authorization. An authenticated `GET /api/registry` returns operations, collections and JSON schemas; responses are not cached.

| Method | Path | Body/result |
| --- | --- | --- |
| GET | `/api/registry/{collection}` | Paginated records; `search`, `page`, `limit` (max 50), `status`, `sort` |
| GET | `/api/registry/{collection}/{id}` | One record |
| POST | `/api/registry/customers` | Customer fields; returns 201 |
| POST | `/api/registry/projects` | Project fields; returns 201 |
| POST | `/api/registry/cms-instances` | `{ "data": { ... }, "confirmExisting": true }`; records an existing CMS |
| PUT | `/api/registry/{collection}/{id}` | Same fields as create; updates the record |
| PATCH | `/api/registry/customers/{id}` or `/api/registry/projects/{id}` | `{ "archived": true }` or `{ "archived": false }` |

Collections are `customers`, `projects`, `cms-instances` and read-only `audit-events`. Projects support a `customer` ID filter; CMS connections support `project`; activity supports `targetCollection` and `targetID`. MCP `list_records` accepts the same filters. IDs are decimal strings. Unsupported filters, duplicate query parameters and unknown fields are rejected. Use JSON bodies (max 64 KiB). Deletion, identity changes and infrastructure operations are unavailable. Creates are not idempotent; after an ambiguous response, inspect the registry before retrying.

Example (the host client supplies `WEBDOCK_ACCESS_TOKEN`; never commit it):

```sh
curl --fail-with-body \
  -H "Authorization: Bearer $WEBDOCK_ACCESS_TOKEN" \
  'https://studio.webdock.dev/api/registry/projects?customer=123&status=active&sort=name'
```

### Upgrading an existing auth deployment

The OAuth provider seeds resources in insert-only mode, so adding `offline_access` to code does not update an existing resource policy. After deploying, run `node --env-file=.env.instance --import tsx scripts/enable-mcp-renewal.ts` from `apps/auth` using the intended environment. This idempotent update appends only `offline_access` to the existing enabled Webdock resource and leaves registered clients, their granted scopes and all other resource settings unchanged. No schema migration is required.
