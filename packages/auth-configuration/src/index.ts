export type AuthProviderConfiguration =
  | { provider: "better-auth" }
  | ({
      provider: "clerk";
      issuer: string;
      authorizedParties: string[];
      allowLocalHTTP?: boolean;
    } & (
      | { tokenMode: "session"; audience?: never }
      | { tokenMode?: never; audience: string }
    ));
function httpsOrigin(value: unknown, allowLocalHTTP = false): string {
  if (typeof value !== "string")
    throw Error("Authentication origin must be a string");
  const url = new URL(value);
  const localHTTP =
    allowLocalHTTP &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!localHTTP && url.protocol !== "https:") || url.origin !== value)
    throw Error("Authentication origin must be an exact HTTPS origin");
  return value;
}
/** Absent configuration preserves existing installs; new configured installs select Clerk explicitly. */
export function readAuthProviderConfiguration(
  raw: string | undefined,
  environment = process.env.NODE_ENV,
): AuthProviderConfiguration {
  if (raw === undefined) return { provider: "better-auth" };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw Error("Invalid authentication configuration JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid authentication configuration");
  const config = value as Record<string, unknown>;
  const provider = config.provider ?? "clerk";
  if (provider === "better-auth" && Object.keys(config).length === 1)
    return { provider: "better-auth" };
  if (
    provider !== "clerk" ||
    Object.keys(config).some(
      (key) =>
        ![
          "provider",
          "issuer",
          "authorizedParties",
          "audience",
          "tokenMode",
          "allowLocalHTTP",
        ].includes(key),
    )
  )
    throw Error("Unsupported authentication configuration");
  if (
    !Array.isArray(config.authorizedParties) ||
    !config.authorizedParties.length ||
    config.authorizedParties.length > 20
  )
    throw Error("Clerk requires explicit authorized parties");
  if (config.tokenMode !== undefined && config.tokenMode !== "session")
    throw Error("Unsupported Clerk token mode");
  if (config.tokenMode === "session" && "audience" in config)
    throw Error("Native Clerk session mode cannot configure an audience");
  if (
    config.tokenMode !== "session" &&
    (typeof config.audience !== "string" ||
      !config.audience.trim() ||
      config.audience.length > 256)
  )
    throw Error("Clerk requires an explicit token audience");
  if (
    config.allowLocalHTTP !== undefined &&
    typeof config.allowLocalHTTP !== "boolean"
  )
    throw Error("Clerk local HTTP option must be a boolean");
  if (config.allowLocalHTTP === true && environment === "production")
    throw Error("Clerk local HTTP is forbidden in production");
  const authorizedParties = config.authorizedParties.map((value) =>
    httpsOrigin(value, config.allowLocalHTTP === true),
  );
  if (new Set(authorizedParties).size !== authorizedParties.length)
    throw Error("Duplicate authorized party");
  return {
    provider: "clerk",
    issuer: httpsOrigin(config.issuer),
    authorizedParties,
    ...(config.allowLocalHTTP === true ? { allowLocalHTTP: true } : {}),
    ...(config.tokenMode === "session"
      ? { tokenMode: "session" as const }
      : { audience: config.audience as string }),
  };
}
