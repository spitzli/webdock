import { checkedOrigin, integrationCookies } from "./index";
import { integrationResumeCookie } from "./integration-callbacks";
type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
/** One fixed API endpoint; neither callback URLs nor bearer credentials come from query parameters. */
export async function resumeIntegrationCallback(
  input: {
    apiOrigin: string;
    uiOrigin: string;
    consoleOrigin: string;
    cookie: string;
    bearerToken: string | null;
    serviceKey?: string;
  },
  fetcher: Fetch = fetch,
): Promise<Response> {
  const api = checkedOrigin(input.apiOrigin),
    ui = checkedOrigin(input.uiOrigin),
    consoleOrigin = checkedOrigin(input.consoleOrigin),
    name = integrationResumeCookie(ui);
  const clear = `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${name.startsWith("__Host-") ? "; Secure" : ""}`;
  const failure = (status: number) =>
    new Response(
      "Integration sign-in could not be refreshed. Return to integrations and start again.",
      {
        status,
        headers: {
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
          "set-cookie": clear,
        },
      },
    );
  if (
    !input.bearerToken ||
    !/^[A-Za-z0-9_.-]{1,16384}$/.test(input.bearerToken)
  )
    return failure(401);
  const handoffs = input.cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(name + "="));
  if (handoffs.length !== 1) return failure(400);
  try {
    const response = await fetcher(new URL("/v1/integrations/resume", api), {
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
      headers: {
        origin: ui,
        authorization: "Bearer " + input.bearerToken,
        ...(input.serviceKey
          ? { "x-webdock-service-key": input.serviceKey }
          : {}),
        cookie: [integrationCookies(input.cookie), handoffs[0]]
          .filter(Boolean)
          .join("; "),
      },
    });
    void response.body?.cancel().catch(() => {});
    if (![302, 303, 307].includes(response.status))
      return failure(
        [400, 401, 403, 404, 409].includes(response.status)
          ? response.status
          : 503,
      );
    const location = response.headers.get("location");
    if (!location) return failure(503);
    const target = new URL(location, ui);
    if (
      ![ui, consoleOrigin].includes(target.origin) ||
      target.username ||
      target.password
    )
      return failure(503);
    const headers = new Headers({
      location: consoleOrigin + target.pathname + target.search + target.hash,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    });
    for (const cookie of response.headers.getSetCookie()) {
      if (
        /^(?:__Host-)?webdock-(?:github|github-flow|git-flow|vercel-flow|byok-vercel|integration-resume)=/.test(
          cookie,
        )
      )
        headers.append("set-cookie", cookie);
    }
    headers.append("set-cookie", clear);
    return new Response(null, { status: 303, headers });
  } catch {
    return failure(503);
  }
}
