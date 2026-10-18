import { readAuthProviderConfiguration } from "@webdock/auth-configuration";
export function readBrowserAuthConfiguration(
  env: Record<string, string | undefined>,
) {
  const configured = readAuthProviderConfiguration(env.WEBDOCK_AUTH_PROVIDER);
  if (configured.provider === "clerk")
    return { ...configured, transport: "console" as const };
  if (env.WEBDOCK_CONSOLE_AUTH_PROVIDER === "clerk")
    return {
      provider: "clerk" as const,
      transport: "console" as const,
      authorizedParties: env.NEXT_PUBLIC_SERVER_URL
        ? [env.NEXT_PUBLIC_SERVER_URL]
        : undefined,
      audience: undefined,
    };
  return { ...configured, transport: "legacy" as const };
}
export const browserAuthConfiguration = readBrowserAuthConfiguration(
  process.env,
);
export function safeBrowserReturn(value: string | null | undefined): string {
  return value?.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\x00-\x1f\x7f]/.test(value)
    ? value
    : "/tenants";
}
