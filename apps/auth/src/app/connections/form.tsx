"use client";
import { useActionState } from "react";
import { registerClient } from "./actions";
export function ClientForm() {
  const [state, action, pending] = useActionState(registerClient, {});
  return <form action={action}>
    <label htmlFor="client-name">Client name</label><input id="client-name" name="name" required maxLength={100} placeholder="My MCP client" />
    <label htmlFor="client-callback">Exact callback URL</label><input id="client-callback" name="redirectURI" type="url" required placeholder="https://client.example/oauth/callback" />
    <p className="muted">Copy this URL from your MCP client. Wildcards are not supported.</p>
    <label className="check"><input name="write" type="checkbox" value="yes" /> Allow registry changes</label>
    <label className="check"><input name="offline" type="checkbox" value="yes" /> Allow automatic token renewal for remote work</label>
    <p className="muted">Optional: stay connected during your working session. Signing out of Webdock or disabling this client stops access.</p>
    <label className="check"><input name="confidential" type="checkbox" value="yes" /> This client can securely store a client secret</label>
    <p className="muted">Desktop and public clients normally use PKCE without a secret. You will still approve access during sign-in.</p>
    {state.error && <p role="alert">{state.error}</p>}
    <button className="button" disabled={pending}>{pending ? "Registering…" : "Register MCP client"}</button>
    {state.clientID && <section aria-live="polite"><h2>Client registered</h2><p>Client ID</p><code>{state.clientID}</code>{state.clientSecret && <><p>Client secret — save it now. It will not be shown again.</p><code style={{ overflowWrap: "anywhere" }}>{state.clientSecret}</code></>}</section>}
  </form>;
}
