import {
  managedAppSchema,
  managedAppProvisionSchema,
  managedAppProvisioningListSchema,
  managedAppProvisioningSchema,
  managedAppProvisioningStatusSchema,
  managedAppListSchema,
  managedAppOperationSchema,
  managedAppGetSchema,
  managedAppCommandSchema,
  type PluginApps,
  httpRequestSchema,
  type PluginHTTP,
  documentKeySchema,
  documentWriteSchema,
  type PluginData,
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
  runtimeCredential?: string;
}): { jobs: PluginJobs; data: PluginData; http: PluginHTTP; apps: PluginApps } {
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
        ...(options.runtimeCredential
          ? { "x-plugin-runtime": options.runtimeCredential }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new PluginError(
        result?.error?.code ?? "unavailable",
        result?.error?.message ?? "Plugin service request failed",
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
    apps: {
      provisioningList: async () =>
        managedAppProvisioningListSchema.parse(
          await call("/v1/plugin/apps", "POST", {
            operation: "provisioningList",
            input: {},
          }),
        ),
      provision: async (input) =>
        managedAppProvisioningSchema.parse(
          await call("/v1/plugin/apps", "POST", {
            operation: "provision",
            input: managedAppProvisionSchema.parse(input),
          }),
        ),
      provisioningStatus: async (input) =>
        managedAppProvisioningSchema.parse(
          await call("/v1/plugin/apps", "POST", {
            operation: "provisioningStatus",
            input: managedAppProvisioningStatusSchema.parse(input),
          }),
        ),
      list: async () =>
        managedAppListSchema.parse(
          await call("/v1/plugin/apps", "POST", {
            operation: "list",
            input: {},
          }),
        ),
      get: async (input) =>
        managedAppSchema.parse(
          await call("/v1/plugin/apps", "POST", {
            operation: "get",
            input: managedAppGetSchema.parse(input),
          }),
        ),
      command: async (input) =>
        managedAppOperationSchema.parse(
          await call("/v1/plugin/apps", "POST", {
            operation: "command",
            input: managedAppCommandSchema.parse(input),
          }),
        ),
    },
    http: {
      request: (input) =>
        call("/v1/plugin/http", "POST", httpRequestSchema.parse(input)),
    },
    data: {
      read: (key) =>
        call(
          "/v1/plugin/data/" + encodeURIComponent(documentKeySchema.parse(key)),
          "GET",
        ),
      write: (input) =>
        call("/v1/plugin/data", "PUT", documentWriteSchema.parse(input)),
    },
    jobs: {
      enqueue: (input) =>
        call("/v1/plugin/jobs", "POST", enqueueJobSchema.parse(input)),
      get: (value) => call("/v1/plugin/jobs/" + id(value), "GET"),
      cancel: (value) => call("/v1/plugin/jobs/" + id(value), "DELETE"),
    },
  };
}
export {
  verifyInvocation,
  invocationClaimsSchema,
  type InvocationClaims,
} from "./invocation.js";
