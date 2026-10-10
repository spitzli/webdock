"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { database } from "@/lib/db";
import { offlineProvisioning } from "@/lib/offline";
import { currentMCPClaims, mcpResource } from "@/lib/mcp";
export type ClientState = { error?: string; clientID?: string; clientSecret?: string };
async function operator() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session || (await currentMCPClaims(session.user.id)).disabled) throw Error("Operator access required");
  return requestHeaders;
}
export async function registerClient(_state: ClientState, form: FormData): Promise<ClientState> {
  try {
    const requestHeaders = await operator();
    const name = String(form.get("name") || "").trim();
    const uri = new URL(String(form.get("redirectURI") || ""));
    const loopback = uri.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(uri.hostname);
    if (!name || name.length > 100 || (uri.protocol !== "https:" && !loopback) || uri.username || uri.password || uri.hash) return { error: "Use a name and an exact HTTPS callback URL (HTTP is allowed only on loopback)." };
    const id = (await database.query("SELECT webdock_auth.next_snowflake() AS id")).rows[0].id;
    const confidential = form.get("confidential") === "yes";
    const offline = form.get("offline") === "yes";
    const hosting = form.get("capability") === "hosting";
    const prefix = hosting ? "hosting" : "webdock";
    const scope = (form.get("write") === "yes" ? `${prefix}:read ${prefix}:write` : `${prefix}:read`) + (offline ? " offline_access" : "");
    // Private context is entered only after a fresh central operator/MFA check.
    const client = await offlineProvisioning.run({ clientID: id }, () => auth.api.adminCreateOAuthClient({ headers: requestHeaders, body: { client_name: name, redirect_uris: [uri.toString()], application_type: loopback ? "native" : "web", scope, grant_types: offline ? ["authorization_code", "refresh_token"] : ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: confidential ? "client_secret_post" : "none", require_pkce: true, skip_consent: false, metadata: hosting ? { webdock_hosting: true } : { webdock_mcp: true } } }));
    try {
      await auth.api.adminLinkClientResource({ headers: requestHeaders, params: { identifier: mcpResource, client_id: client.client_id } });
    } catch (error) {
      await database.query('UPDATE webdock_auth."oauthClient" SET disabled=true WHERE "clientId"=$1', [client.client_id]);
      throw error;
    }
    revalidatePath("/connections");
    return { clientID: client.client_id, clientSecret: client.client_secret };
  } catch { return { error: "The client could not be registered. Check your operator session and try again." }; }
}
export async function disableClient(form: FormData) {
  await operator();
  const id = String(form.get("id") || "");
  if (!/^[1-9][0-9]{0,18}$/.test(id)) throw Error("Invalid client");
  await database.query(`UPDATE webdock_auth."oauthClient" SET disabled=true WHERE "clientId"=$1 AND (metadata::jsonb->>'webdock_mcp'='true' OR metadata::jsonb->>'webdock_hosting'='true')`, [id]);
  revalidatePath("/connections");
}
