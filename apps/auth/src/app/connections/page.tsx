import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { currentMCPClaims, mcpResource } from "@/lib/mcp";
import { database } from "@/lib/db";
import { ClientForm } from "./form";
import { disableClient } from "./actions";
export default async function Connections() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  if ((await currentMCPClaims(session.user.id)).disabled) redirect("/account");
  const { rows } = await database.query(`SELECT "clientId",name,disabled,scopes FROM webdock_auth."oauthClient" WHERE metadata::jsonb->>'webdock_mcp'='true' ORDER BY "createdAt" DESC LIMIT 100`);
  return <section className="auth-panel"><p className="eyebrow">Operator connections</p><h1>Connect your tools</h1><p>Let an MCP client read your Webdock registry or manage records with your permission.</p><p>Server URL: <code>{mcpResource}</code></p><ClientForm /><h2>Registered clients</h2>{rows.length ? rows.map(row => <article key={row.clientId}><h3>{row.name || "MCP client"}</h3><p><code>{row.clientId}</code> · {row.disabled ? "Disabled" : "Active"}</p>{!row.disabled && <form action={disableClient}><input type="hidden" name="id" value={row.clientId} /><button className="button secondary">Disable access</button></form>}</article>) : <p>No MCP clients registered yet.</p>}<Link href="/account">Back to account</Link></section>;
}
