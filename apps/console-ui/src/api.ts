import { z } from "zod";
const origin = z.url().refine((value) => {
  const url = new URL(value);
  return (
    ["https:", "http:"].includes(url.protocol) &&
    !url.username &&
    !url.password &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash
  );
}, "Expected an HTTP(S) origin");
export const runtimeConfigSchema = z
  .object({
    apiOrigin: origin,
    authOrigin: origin,
    enabledFeatures: z.array(z.string().max(80)).max(64),
    browserFacade: z.boolean().optional(),
    consoleOrigin: origin.optional(),
    surface: z.enum(["account", "console"]).optional(),
    sso: z.boolean().optional(),
    mailGatewayOrigin: origin.refine((value) => value.startsWith("https://")).optional(),
    localePreference: z.enum(["system", "en", "de"]).optional(),
  })
  .strict();
export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;
export const sessionSchema = z.object({
  data: z
    .object({
      user: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        role: z.string().nullish(),
        emailVerified: z.boolean(),
        twoFactorEnabled: z.boolean().optional(),
        mustChangePassword: z.boolean().optional(),
        preview: z.boolean().optional(),
      }),
      session: z.object({
        id: z.string(),
        userId: z.string(),
        expiresAt: z.string(),
      }),
    })
    .nullable(),
});
export type Session = NonNullable<z.infer<typeof sessionSchema>["data"]>;
export const recordSchema = z.object({
  id: z.string().regex(/^[1-9][0-9]{0,18}$/),
  name: z.string().optional(),
  status: z.string().optional(),
  customer: z.string().optional(),
  customerType: z.string().nullish(),
  contactEmail: z.string().nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  companyName: z.string().nullish(),
  contactName: z.string().nullish(),
  addressLine1: z.string().nullish(),
  addressLine2: z.string().nullish(),
  postalCode: z.string().nullish(),
  city: z.string().nullish(),
  region: z.string().nullish(),
  country: z.string().nullish(),
  phone: z.string().nullish(),
  url: z.string().nullish(),
  repositoryURL: z.string().nullish(),
  notes: z.string().nullish(),
  summary: z.string().optional(),
  actor: z.string().optional(),
  changedFields: z.string().nullish(),
  action: z.string().optional(),
  targetCollection: z.string().optional(),
  targetID: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type RegistryRecord = z.infer<typeof recordSchema>;
export const listSchema = z.object({
  docs: z.array(recordSchema).max(50),
  page: z.number().int(),
  totalPages: z.number().int(),
  totalDocs: z.number().int(),
  hasNextPage: z.boolean(),
  hasPrevPage: z.boolean(),
});
export type Collection = "customers" | "projects" | "audit-events";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class ApiClient {
  constructor(
    public config: RuntimeConfig,
    private fetcher: typeof fetch = fetch,
  ) {}
  async request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: RequestInit = {},
    auth = false,
  ): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
      throw new Error("Invalid API path");
    if (this.config.browserFacade) path = facadePath(path, auth);
    const base = new URL(
      auth && !this.config.browserFacade
        ? this.config.authOrigin
        : this.config.apiOrigin,
    );
    const url = new URL(path, base);
    if (url.origin !== base.origin) throw new Error("Invalid API path");
    const fetcher = this.fetcher;
    const headers = new Headers(options.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    if (options.body && !headers.has("Content-Type"))
      headers.set("Content-Type", "application/json");
    const response = await fetcher(url, {
      ...options,
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      headers,
    });
    if (!response.ok)
      throw new ApiError(response.status, response.status === 409 ? await conflictMessage(response) : errorMessage(response.status, auth));
    const text = await response.text();
    if (text.length > 1048576)
      throw new Error("The response exceeds the supported size.");
    try {
      return schema.parse(JSON.parse(text));
    } catch {
      throw new Error("The service returned an unsupported response.");
    }
  }
  get<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal) {
    return this.request(path, schema, { signal: signal ?? null });
  }
  write<T>(
    path: string,
    method: "POST" | "PUT" | "PATCH",
    data: unknown,
    schema: z.ZodType<T>,
    auth = false,
  ) {
    return this.request(
      path,
      schema,
      { method, body: JSON.stringify(data) },
      auth,
    );
  }
}
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const response = await fetch("/console-config.json", {
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(
      "Console configuration is unavailable. Contact the installation operator.",
    );
  return runtimeConfigSchema.parse(await response.json());
}

function facadePath(path: string, auth: boolean): string {
  if (path === "/v1/auth/session") return "/api/console/session";
  if (path.startsWith("/v1/operator/registry/"))
    return path.replace("/v1/operator/registry/", "/api/console/registry/");
  if (auth && path.startsWith("/api/auth/"))
    return path.replace("/api/auth/", "/api/console/auth/");
  return path;
}
/** Conflicts carry a fixed, human-written reason from the server (for example why a delete is refused). */
async function conflictMessage(response: Response): Promise<string> {
  const body = z.object({ error: z.object({ message: z.string().min(1).max(300) }) }).safeParse(await response.json().catch(() => null));
  return body.success ? body.data.error.message : errorMessage(409, false);
}
function errorMessage(status: number, auth: boolean): string {
  switch (status) {
    case 401:
      return auth
        ? "Sign-in verification failed. Check your credentials and try again."
        : "Your session has expired. Sign in again.";
    case 403:
      return "You do not have access to this action.";
    case 409:
      return "This record changed or has linked resources. Refresh and review it before trying again.";
    case 404:
      return "This resource is unavailable.";
    case 400:
    case 422:
      return "Check the entered values and try again.";
    default:
      return "The service could not complete this request. Try again.";
  }
}
