import type { GitOAuthCommand } from "@webdock/hosting-contracts/git-oauth";
import { gitOAuthCommandSchema } from "@webdock/hosting-contracts/git-oauth";

export function gitFlowCookie(origin: string) {
  return `${new URL(origin).protocol === "https:" ? "__Host-" : ""}webdock-git-flow`;
}
export function readGitFlowCookie(headers: Headers, origin: string) {
  const prefix = gitFlowCookie(origin) + "=";
  const matches = (headers.get("cookie") ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(prefix));
  const value = matches.length === 1 ? matches[0].slice(prefix.length) : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw Error("Invalid Git flow");
  return value;
}
export async function gitConnectionRoute(
  request: Request,
  step: "connect" | "callback" | "select",
  deps: {
    origin: string;
    call: (command: GitOAuthCommand) => Promise<Record<string, unknown>>;
  },
) {
  const origin = new URL(deps.origin).origin;
  const cookie = (value: string, age: number) =>
    `${gitFlowCookie(origin)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${origin.startsWith("https:") ? "; Secure" : ""}`;
  const redirect = (location: string, flowCookie?: string) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: location,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        ...(flowCookie ? { "Set-Cookie": flowCookie } : {}),
      },
    });
  try {
    if (
      step !== "callback" &&
      (request.method !== "POST" || request.headers.get("origin") !== origin)
    )
      return new Response(null, { status: 403 });
    if (step === "callback") {
      if (request.method !== "GET") return new Response(null, { status: 405 });
      const q = new URL(request.url).searchParams;
      if (q.has("error") || [...q.keys()].some((k) => q.getAll(k).length !== 1))
        throw Error();
      const state = readGitFlowCookie(request.headers, origin);
      if (q.get("state") !== state) throw Error();
      await deps.call(
        gitOAuthCommandSchema.parse({
          action: "git.oauth.exchange",
          state,
          code: q.get("code"),
        }),
      );
      return redirect(`${origin}/hosting/git/connect`);
    }
    if (
      !request.headers
        .get("content-type")
        ?.startsWith("application/x-www-form-urlencoded")
    )
      return new Response(null, { status: 415 });
    const reader = request.body?.getReader();
    if (!reader) throw Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4096) {
          await reader.cancel();
          throw Error();
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    if ([...form.keys()].some((k) => form.getAll(k).length !== 1))
      throw Error();
    if (step === "connect") {
      const result = await deps.call(
        gitOAuthCommandSchema.parse({
          action: "git.oauth.begin",
          customerID: form.get("customerID"),
        }),
      );
      const url = new URL(String(result.url));
      if (
        url.origin !== "https://github.com" ||
        url.pathname !== "/login/oauth/authorize" ||
        !/^[A-Za-z0-9_-]{43}$/.test(String(result.state))
      )
        throw Error();
      return redirect(url.href, cookie(String(result.state), 600));
    }
    const result = await deps.call(
      gitOAuthCommandSchema.parse({
        action: "git.oauth.finish",
        state: readGitFlowCookie(request.headers, origin),
        installationID: form.get("installationID"),
        repositoryID: form.get("repositoryID"),
      }),
    );
    if (!/^[1-9][0-9]{0,18}$/.test(String(result.customerID))) throw Error();
    return redirect(
      `${origin}/tenants/${result.customerID}/hosting`,
      cookie("", 0),
    );
  } catch {
    return redirect(`${origin}/hosting/git/connection-error`, cookie("", 0));
  }
}
