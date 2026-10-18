type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
export function checkedOrigin(value: string) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      ))
  )
    throw Error("Invalid API origin");
  return url.origin;
}
export function sessionCookies(raw: string): string {
  return raw
    .split(";")
    .map((part) => part.trim())
    .filter((part) =>
      /^(?:(?:__Host-)?webdock-(?:sso|github|github-flow|git-flow|vercel-flow|byok-vercel)|__Host-webdock-auth\.[A-Za-z0-9_.-]+|webdock-auth\.[A-Za-z0-9_.-]+)=/.test(
        part,
      ),
    )
    .join("; ");
}
/** Provider integration state is not browser authentication and may accompany the selected bearer. */
export function integrationCookies(raw: string): string {
  return raw
    .split(";")
    .map((part) => part.trim())
    .filter((part) =>
      /^(?:__Host-)?webdock-(?:github|github-flow|git-flow|vercel-flow|byok-vercel)=/.test(
        part,
      ),
    )
    .join("; ");
}
/** Server transport only: origins come from deployment config, never form values. */
export async function requestAPI<T = unknown>(
  input: {
    apiOrigin: string;
    uiOrigin: string;
    cookie: string;
    bearerToken?: string;
    path: string;
    body?: unknown;
    method?: string;
    consoleSession?: { token: string; serviceKey: string };
  },
  fetcher: Fetch = fetch,
): Promise<{ status: number; body: T }> {
  const origin = checkedOrigin(input.apiOrigin),
    uiOrigin = checkedOrigin(input.uiOrigin);
  const url = new URL(input.path, origin);
  if (
    !input.path.startsWith("/") ||
    input.path.startsWith("//") ||
    input.path.includes("\\") ||
    url.origin !== origin
  )
    throw Error("Invalid API path");
  if (
    input.bearerToken !== undefined &&
    (input.path !== "/v1/studio" ||
      !/^[A-Za-z0-9_.-]{1,16384}$/.test(input.bearerToken))
  )
    throw Error("Browser bearer is restricted to Studio");
  if (
    input.consoleSession &&
    (input.path !== "/v1/console" ||
      !input.consoleSession.token ||
      input.consoleSession.token.length > 16384 ||
      input.consoleSession.serviceKey.length < 32)
  )
    throw Error("Invalid Console transport");
  if (input.bearerToken !== undefined && input.consoleSession)
    throw Error("Ambiguous browser authentication transport");
  const response = await fetcher(url, {
    method: input.method || (input.body === undefined ? "GET" : "POST"),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(45_000),
    headers: {
      "content-type": "application/json",
      ...(input.bearerToken
        ? { authorization: "Bearer " + input.bearerToken }
        : {}),
      origin: uiOrigin,
      ...(input.consoleSession
        ? {
            authorization: "Bearer " + input.consoleSession.token,
            "x-webdock-service-key": input.consoleSession.serviceKey,
          }
        : {}),
      cookie: input.consoleSession
        ? ""
        : input.bearerToken
          ? integrationCookies(input.cookie)
          : input.path.startsWith("/v1/public/")
            ? ""
            : sessionCookies(input.cookie)
                .split("; ")
                .filter((part) =>
                  input.path.startsWith("/v1/auth/")
                    ? /^(?:__Host-)?webdock-auth\./.test(part)
                    : /^(?:__Host-)?webdock-(?:sso|github|github-flow|git-flow|vercel-flow|byok-vercel)=/.test(
                        part,
                      ),
                )
                .join("; "),
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  if (Number(response.headers.get("content-length")) > 2_000_000) {
    await response.body?.cancel();
    throw Error("API returned an oversized response");
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("API returned no response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 2_000_000) throw Error("API returned an oversized response");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const body: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw Error("API returned an invalid response envelope");
  return { status: response.status, body: body as T };
}
