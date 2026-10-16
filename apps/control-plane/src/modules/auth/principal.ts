import {
  createBetterAuthAuthenticator,
  betterAuthIdentity,
} from "@webdock/adapter-auth-better-auth";
import { browserAuthProvider, getClerkBrowserAdapter } from "./clerk-runtime";
import { createBrowserPrincipal } from "./browser-principal";
const local = createBetterAuthAuthenticator(async (headers) => {
  const { auth } = await import("./auth");
  return auth.api.getSession({ headers });
});
export const {
  withTrustedLocalSession,
  currentTrustedBrowserReference,
  trustedLocalSessionKind,
  resolveSessionReference,
  selectedIdentityDirectory,
} = createBrowserPrincipal({
  provider: browserAuthProvider,
  local,
  localDirectory: betterAuthIdentity,
  clerkDirectory: () => getClerkBrowserAdapter().identity,
});
