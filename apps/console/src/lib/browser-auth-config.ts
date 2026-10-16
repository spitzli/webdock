import { readAuthProviderConfiguration } from "@webdock/core/auth-configuration";
export const browserAuthConfiguration = readAuthProviderConfiguration(
  process.env.WEBDOCK_AUTH_PROVIDER,
);
export function safeBrowserReturn(value: string | null | undefined): string {
  return value?.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\x00-\x1f\x7f]/.test(value)
    ? value
    : "/tenants";
}
