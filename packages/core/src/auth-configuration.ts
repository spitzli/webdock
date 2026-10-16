export type AuthProviderConfiguration =
  | { provider: "better-auth" }
  | {
      provider: "clerk";
      issuer: string;
      authorizedParties: string[];
      audience: string;
    };
function httpsOrigin(value: unknown): string {
  if (typeof value !== "string")
    throw Error("Authentication origin must be a string");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== value)
    throw Error("Authentication origin must be an exact HTTPS origin");
  return value;
}
/** Absent configuration preserves existing installs; new configured installs select Clerk explicitly. */
export function readAuthProviderConfiguration(
  raw: string | undefined,
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
        !["provider", "issuer", "authorizedParties", "audience"].includes(key),
    )
  )
    throw Error("Unsupported authentication configuration");
  if (
    !Array.isArray(config.authorizedParties) ||
    !config.authorizedParties.length ||
    config.authorizedParties.length > 20
  )
    throw Error("Clerk requires explicit authorized parties");
  if (
    typeof config.audience !== "string" ||
    !config.audience.trim() ||
    config.audience.length > 256
  )
    throw Error("Clerk requires an explicit token audience");
  const authorizedParties = config.authorizedParties.map(httpsOrigin);
  if (new Set(authorizedParties).size !== authorizedParties.length)
    throw Error("Duplicate authorized party");
  return {
    provider: "clerk",
    issuer: httpsOrigin(config.issuer),
    authorizedParties,
    audience: config.audience,
  };
}
