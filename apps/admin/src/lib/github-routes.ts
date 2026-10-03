import { revalidatePath } from "next/cache";
import { getCMS } from "./server";
import { getGitHub, githubOrigin } from "./github";
import { linkGitHubRepository } from "./github-project";

const notice = (status: string) =>
  new Response(null, {
    status: 303,
    headers: {
      Location: new URL(`/integrations?github=${status}`, githubOrigin()).href,
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

export async function githubConnect(request: Request) {
  const actor = await operator(request);
  if (!actor) return new Response(null, { status: 403 });
  const github = getGitHub();
  return github ? github.connect(request, actor.user.id) : notice("setup");
}
export async function githubCallback(request: Request) {
  const github = getGitHub();
  if (!github) return notice("setup");
  const actor = await operator(request);
  return github.callback(request, actor?.user.id || "");
}
export async function githubDisconnect(request: Request) {
  const actor = await operator(request);
  if (!actor) return new Response(null, { status: 403 });
  const github = getGitHub();
  return github ? github.disconnect(request) : notice("setup");
}
export async function githubSelect(request: Request) {
  if (
    request.method !== "POST" ||
    request.headers.get("origin") !== new URL(githubOrigin()).origin
  )
    return new Response(null, { status: 403 });
  if (
    !request.headers
      .get("content-type")
      ?.startsWith("application/x-www-form-urlencoded")
  )
    return new Response(null, { status: 415 });
  if (Number(request.headers.get("content-length")) > 4096)
    return new Response(null, { status: 413 });
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          return new Response(null, { status: 413 });
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  const body = Buffer.concat(chunks).toString("utf8");
  const actor = await operator(request);
  if (!actor) return new Response(null, { status: 403 });
  const github = getGitHub();
  if (!github) return notice("setup");
  const session = await github.session(request.headers, actor.user.id);
  if (!session) return notice("expired");
  try {
    const form = new URLSearchParams(body);
    if ([...form.keys()].some((key) => form.getAll(key).length !== 1))
      return notice("save-failed");
    const project = await linkGitHubRepository(
      actor,
      github,
      session,
      Object.fromEntries(form),
    );
    revalidatePath("/");
    revalidatePath(`/projects/${project.id}`);
    revalidatePath("/integrations");
    return new Response(null, {
      status: 303,
      headers: {
        Location: new URL(`/projects/${project.id}`, githubOrigin()).href,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return notice("save-failed");
  }
}
