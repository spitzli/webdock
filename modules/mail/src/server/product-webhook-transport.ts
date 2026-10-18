import dns from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
export function webhookEndpointProblem(value: string): string | null {
  let url: URL;
  try {
    if (typeof value !== "string" || value.length > 2048) throw Error();
    url = new URL(value);
  } catch {
    return "Use a valid HTTPS URL";
  }
  const host = url.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== "443")
  )
    return "Use HTTPS port 443 without credentials or fragments";
  if (
    isIP(host) ||
    host === "localhost" ||
    /\.(localhost|local|internal|test|invalid)$/.test(host) ||
    !host.includes(".")
  )
    return "Use a public hostname";
  return null;
}
export function isPublicAddress(value: string): boolean {
  try {
    return ipaddr.process(value).range() === "unicast";
  } catch {
    return false;
  }
}
type Options = {
  resolve?: (host: string) => Promise<{ address: string; family: number }[]>;
  signal?: AbortSignal;
};
/** The checked DNS result is pinned for TCP while hostname/SNI certificate verification remain intact. */
export async function postMailWebhook(
  url: string,
  headers: Record<string, string>,
  body: string,
  options: Options = {},
): Promise<{ status: number; response: string }> {
  const problem = webhookEndpointProblem(url);
  if (problem) throw Error(problem);
  const target = new URL(url),
    hostname = target.hostname.replace(/\.$/, ""),
    signal = AbortSignal.any([
      AbortSignal.timeout(15000),
      ...(options.signal ? [options.signal] : []),
    ]);
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (
      error: unknown,
      result?: { status: number; response: string },
    ) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", abort);
      if (error) reject(Error("Webhook transport failed"));
      else resolve(result!);
    };
    const abort = () => finish(Error("Deadline"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    (options.resolve
      ? options.resolve(hostname)
      : dns.lookup(hostname, { all: true })
    )
      .then((addresses) => {
        signal.throwIfAborted();
        if (
          !addresses.length ||
          addresses.some((a) => !isPublicAddress(a.address))
        )
          throw Error("Nonpublic address");
        const pinned = addresses[0];
        const request = https.request(
          {
            hostname,
            servername: hostname,
            port: 443,
            path: target.pathname + target.search,
            method: "POST",
            headers,
            agent: false,
            signal,
            lookup: (_host, settings, callback) => {
              if (settings.all) callback(null, [pinned]);
              else callback(null, pinned.address, pinned.family);
            },
          },
          (response) => {
            const chunks: Buffer[] = [];
            let size = 0;
            const complete = () =>
              finish(null, {
                status: response.statusCode ?? 0,
                response: Buffer.concat(chunks).toString("utf8").slice(0, 500),
              });
            response.on("data", (part: Buffer) => {
              const chunk = Buffer.from(part);
              chunks.push(chunk.subarray(0, Math.max(0, 2048 - size)));
              size += chunk.length;
              if (size >= 2048) {
                complete();
                response.destroy();
              }
            });
            response.on("end", complete);
            response.on("error", finish);
            response.on("aborted", () => finish(Error("Interrupted")));
          },
        );
        request.on("error", finish);
        request.end(body);
      })
      .catch(finish);
  });
}
