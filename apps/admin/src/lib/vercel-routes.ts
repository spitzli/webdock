import { revalidatePath } from "next/cache";
import { getCMS } from "./server";
import { configureVercelOAuth } from "./vercel-oauth";
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
  const settings = vercelSettings();
  if (!settings) return notice("setup");
  const oauth = configureVercelOAuth(settings);
  let response: Response;
  try {
    const actor = await operator(request);
    if (!actor) throw Error("Sign in required");
    const credential = await oauth.finish(request, actor.user.id);
    await saveVercelConnection(actor, credential, settings.cookieSecret);
    revalidatePath("/integrations");
    response = notice("connected");
  } catch {
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
  if (!actor) return new Response(null, { status: 403 });
  const settings = vercelSettings();
  if (!settings) return notice("setup");
  await removeVercelConnection(actor, settings.teamID);
  revalidatePath("/integrations");
  return notice("disconnected");
}
