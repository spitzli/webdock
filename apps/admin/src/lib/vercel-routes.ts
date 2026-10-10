import { revalidatePath } from "next/cache";
import { getCMS } from "./server";
import { operatorPreviewDenial } from "./preview-guard";
import { configureVercelOAuth, VercelOAuthError } from "./vercel-oauth";
import { vercelSettings } from "./vercel-settings";
import { saveVercelConnection, removeVercelConnection } from "./vercel-store";
const origin = () =>
  process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3120";
const notice = (state: string) =>
  new Response(null, {
    status: 303,
    headers: {
      Location: new URL("/integrations?vercel=" + state, origin()).href,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
async function operator(request: Request) {
  const denied = await operatorPreviewDenial(request.headers);
  if (denied) return denied;
  const payload = await getCMS();
  const { user } = await payload.auth({ headers: request.headers });
  return user?.collection === "users" && user.role === "operator"
    ? { payload, user }
    : null;
}
export async function vercelConnect(request: Request) {
  if (
    request.method !== "POST" ||
    request.headers.get("origin") !== new URL(origin()).origin
  )
    return new Response(null, { status: 403 });
  const actor = await operator(request);
  if (actor instanceof Response) return actor;
  if (!actor) return new Response(null, { status: 403 });
  const settings = vercelSettings();
  if (!settings) return notice("setup");
  const flow = await configureVercelOAuth(settings).start(actor.user.id);
  return new Response(null, {
    status: 303,
    headers: {
      Location: flow.url,
      "Set-Cookie": flow.cookie,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export async function vercelCallback(request: Request) {
  const state=new URL(request.url).searchParams.get('state');
  const byokCookie=(request.headers.get('cookie')??'').split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-webdock-byok-vercel=')||v.startsWith('webdock-byok-vercel='));
  if(state&&byokCookie?.slice(byokCookie.indexOf('=')+1)===state) {
    const {GET}=await import('../app/api/hosting/vercel/callback/route');return GET(request);
  }
  const actor = await operator(request);
  if (actor instanceof Response) return actor;
  const settings = vercelSettings();
  if (!settings) return notice("setup");
  const oauth = configureVercelOAuth(settings);
  let response: Response;
  try {
    if (!actor) throw Error("Sign in required");
    const { completionURL, ...credential } = await oauth.finish(request, actor.user.id);
    await saveVercelConnection(actor, credential, settings.cookieSecret);
    revalidatePath("/integrations");
    response = new Response(null, {status:303,headers:{Location:completionURL,"Cache-Control":"no-store","Referrer-Policy":"no-referrer","Cross-Origin-Opener-Policy":"unsafe-none"}});
  } catch (error) {
    const params = new URL(request.url).searchParams;
    console.warn(JSON.stringify({event:"webdock_vercel_callback_failed",stage:error instanceof VercelOAuthError?error.stage:actor?"save-connection":"operator-session",hasState:params.has("state"),hasCode:params.has("code"),hasTeam:params.has("teamId"),hasConfiguration:params.has("configurationId")}));
    response = notice("failed");
  }
  response.headers.append("Set-Cookie", oauth.clearCookie());
  return response;
}
export async function vercelDisconnect(request: Request) {
  if (
    request.method !== "POST" ||
    request.headers.get("origin") !== new URL(origin()).origin
  )
    return new Response(null, { status: 403 });
  const actor = await operator(request);
  if (actor instanceof Response) return actor;
  if (!actor) return new Response(null, { status: 403 });
  const settings = vercelSettings();
  if (!settings) return notice("setup");
  await removeVercelConnection(actor, settings.teamID);
  revalidatePath("/integrations");
  return notice("disconnected");
}
