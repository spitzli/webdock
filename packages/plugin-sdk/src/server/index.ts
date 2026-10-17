import {
  enqueueJobSchema,
  jobIDSchema,
  PluginError,
  type PluginJobs,
} from "../contracts/index.js";
/** Construct per invocation. The token provider must return current, short-lived host authority. */
export function createPluginContext(options: {
  hostURL: string;
  token: () => string | Promise<string>;
  fetch?: typeof fetch;
}): { jobs: PluginJobs } {
  const base = new URL(options.hostURL);
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/" ||
    !(
      base.protocol === "https:" ||
      (base.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname))
    )
  )
    throw new PluginError(
      "invalid_input",
      "Use an HTTPS host origin (loopback HTTP is allowed for local development)",
    );
  async function call(path: string, method: string, body?: unknown) {
    const response = await (options.fetch ?? fetch)(new URL(path, base), {
      method,
      headers: {
        Authorization: `Bearer ${await options.token()}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new PluginError(
        result?.error?.code ?? "unavailable",
        result?.error?.message ?? "Plugin job request failed",
        response.status >= 500,
      );
    return result;
  }
  const id = (value: string) => {
    if (!jobIDSchema.safeParse(value).success)
      throw new PluginError("invalid_input", "Invalid job ID");
    return value;
  };
  return {
    jobs: {
      enqueue: (input) =>
        call("/v1/plugin/jobs", "POST", enqueueJobSchema.parse(input)),
      get: (value) => call("/v1/plugin/jobs/" + id(value), "GET"),
      cancel: (value) => call("/v1/plugin/jobs/" + id(value), "DELETE"),
    },
  };
}
