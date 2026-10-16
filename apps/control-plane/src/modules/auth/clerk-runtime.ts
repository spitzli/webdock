import { readAuthProviderConfiguration } from "@webdock/core/auth-configuration";
import { createClerkAdapter } from "@webdock/adapter-auth-clerk";
import { createClerkBackend } from "@webdock/adapter-auth-clerk/sdk";
import { betterAuthIdentity } from "@webdock/adapter-auth-better-auth";
import { serializeSignedCookie } from "better-call";
import { authDatabase, workerDatabase } from "../../db/runtime";
import { createClerkMappings } from "./clerk-mappings";
import { createClerkSessionBridge } from "./clerk-bridge";

const configuration = readAuthProviderConfiguration(
  process.env.WEBDOCK_AUTH_PROVIDER,
);
export const browserAuthProvider = configuration.provider;
export function getClerkBrowserAdapter() {
  if (configuration.provider !== "clerk")
    throw Error("Clerk is not the selected browser provider");
  return createClerkAdapter({
    config: configuration,
    backend: createClerkBackend(
      process.env.CLERK_SECRET_KEY ?? "",
      process.env.CLERK_JWT_KEY,
    ),
    mappings: createClerkMappings(
      process.env.WEBDOCK_PROCESS_ROLE === "worker"
        ? workerDatabase
        : authDatabase,
    ),
    local: betterAuthIdentity,
  });
}
export function validateBrowserAuthConfiguration() {
  if (configuration.provider === "clerk") {
    if (!/^sk_(live|test)_/.test(process.env.CLERK_SECRET_KEY ?? ""))
      throw Error("Configured Clerk backend secret required");
    const origin = new URL(
      process.env.WEBDOCK_CONSOLE_ORIGIN ??
        process.env.WEBDOCK_SSO_APP_ORIGIN ??
        "",
    ).origin;
    if (!configuration.authorizedParties.includes(origin))
      throw Error("Studio origin must be a configured Clerk authorized party");
  }
  return browserAuthProvider;
}
export async function clerkBrowserSession(headers: Headers) {
  const clerk = getClerkBrowserAdapter();
  return createClerkSessionBridge({
    database: authDatabase,
    verifyExternal: clerk.verifyExternal,
    origin: new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3125")
      .origin,
    async signSession(token) {
      const { auth } = await import("./auth");
      const context = await auth.$context;
      return (
        await serializeSignedCookie(
          context.authCookies.sessionToken.name,
          token,
          context.secret,
        )
      ).split(";")[0];
    },
  })(headers);
}
