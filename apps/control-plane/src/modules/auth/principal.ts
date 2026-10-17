import {
  betterAuthIdentity,
} from "@webdock/auth-better-auth";
import { createPlugin as createBetterAuthPlugin } from "@webdock/auth-better-auth/plugin";
import { readAuthProviderConfiguration } from "@webdock/auth-configuration";
const browserAuthProvider = readAuthProviderConfiguration(process.env.WEBDOCK_AUTH_PROVIDER).provider;
import { createBrowserPrincipal } from "./browser-principal";
const local = createBetterAuthPlugin(async (headers) => {
  const { auth } = await import("./auth");
  return auth.api.getSession({ headers });
}).authenticator;
export const {
  withTrustedLocalSession,
  currentTrustedBrowserReference,
  trustedLocalSessionKind,
  resolveSessionReference: resolveBrowserSessionReference,
  selectedIdentityDirectory: browserIdentityDirectory,
} = createBrowserPrincipal({
  provider: browserAuthProvider,
  local,
  localDirectory: betterAuthIdentity,
  clerkDirectory: () => ({
    session: async (...args) =>
      (await (await import("./clerk-runtime")).getClerkBrowserAdapter()).identity.session(...args),
    subject: async (...args) =>
      (await (await import("./clerk-runtime")).getClerkBrowserAdapter()).identity.subject(...args),
    membership: async (...args) =>
      (await (await import("./clerk-runtime")).getClerkBrowserAdapter()).identity.membership(...args),
  }),
});

import { AsyncLocalStorage } from "node:async_hooks";
import { withDatabaseScope } from "@webdock/database-runtime";
import { ConsoleAuthError, type ConsolePrincipal } from "./clerk-identity";
const principals = new AsyncLocalStorage<ConsolePrincipal>();
export function currentConsolePrincipal() {
  const principal = principals.getStore();
  if (principal && principal.expiresAt <= Date.now())
    throw new ConsoleAuthError(401, "Sign in again.");
  return principal;
}
export function withConsolePrincipal<T>(
  principal: ConsolePrincipal,
  run: () => T,
): T {
  return principals.run(principal, () =>
    withDatabaseScope(
      {
        kind: "session",
        subject: principal.userID,
        sessionID: principal.sessionID,
        clerk: {
          issuer: principal.issuer,
          userID: principal.clerkUserID,
          organizationID: principal.organizationID,
          clerkOrganizationID: principal.clerkOrganizationID,
          customerID: principal.customerID,
          role: principal.role,
          permissions: principal.permissions ?? [],
          verifiedAt: principal.verifiedAt,
          expiresAt: principal.expiresAt,
        },
      },
      run,
    ),
  );
}
/** Callers must still validate the customer's active state and resource relationship. */
export function consoleMembership(userID: string, organizationID: string) {
  const principal = currentConsolePrincipal();
  if (!principal) return undefined;
  if (principal.userID !== userID)
    throw new ConsoleAuthError(403, "Console identity mismatch.");
  return principal.organizationID === organizationID && principal.role
    ? { id: null, role: principal.role }
    : null;
}
export function withStoredConsolePrincipal<T>(
  principal: ConsolePrincipal,
  run: () => T,
): T {
  // Gateway/worker DB capabilities remain independently scoped by their caller.
  return principals.run(principal, run);
}
export function storedConsoleIdentity() {
  const p = currentConsolePrincipal();
  return p
    ? {
        issuer: p.issuer,
        userID: p.clerkUserID,
        sessionID: p.sessionID,
        organizationID: p.clerkOrganizationID,
      }
    : null;
}

/** Console principals have already passed live provider verification at the transport boundary. */
export async function resolveSessionReference(headers: Headers) {
  const principal = currentConsolePrincipal();
  return principal
    ? { subject: principal.userID, sessionID: principal.sessionID }
    : resolveBrowserSessionReference(headers);
}
export const selectedIdentityDirectory: import("@webdock/core/identity").IdentityDirectory =
  {
    async subject(db, subject, options) {
      const principal = currentConsolePrincipal();
      if (!principal)
        return browserIdentityDirectory.subject(db, subject, options);
      if (principal.userID !== subject) return null;
      const local = await betterAuthIdentity.subject(db, subject, options);
      if (
        !local ||
        local.banned ||
        local.role !== (principal.operator ? "operator" : "user")
      )
        return null;
      // Console account setup and email verification are owned by the verified provider.
      return {
        ...local,
        emailVerified: true,
        mustChangePassword: false,
        twoFactorEnabled: false,
        operatorAuthorized: principal.operator,
      };
    },
    async session(db, reference, options) {
      const principal = currentConsolePrincipal();
      if (!principal)
        return browserIdentityDirectory.session(db, reference, options);
      if (
        principal.userID !== reference.subject ||
        principal.sessionID !== reference.sessionID
      )
        return null;
      const local = await selectedIdentityDirectory.subject(
        db,
        reference.subject,
        options,
      );
      if (!local) return null;
      const preview =
        (
          await db.query(
            "SELECT session_id FROM webdock_auth.console_tenant_preview WHERE session_id=$1 AND issuer=$2",
            [reference.sessionID, principal.issuer],
          )
        ).rows.length > 0;
      return { ...local, sessionID: reference.sessionID, preview };
    },
    async membership(db, subject, customerID, options) {
      const principal = currentConsolePrincipal();
      if (!principal) {
        const tenant = (
          await db.query(
            "SELECT organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$1",
            [customerID],
          )
        ).rows[0];
        if (!tenant) return null;
        const { linkedMembershipRole } = await import("./clerk-provider");
        const role = await linkedMembershipRole(
          subject,
          tenant.organization_id,
        );
        return role === undefined
          ? browserIdentityDirectory.membership(
              db,
              subject,
              customerID,
              options,
            )
          : { memberID: null, role };
      }
      if (principal.userID !== subject)
        throw new ConsoleAuthError(403, "Console identity mismatch.");
      const tenant = (
        await db.query(
          "SELECT organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$1",
          [customerID],
        )
      ).rows[0];
      if (!tenant) return null;
      return {
        memberID: null,
        role:
          principal.customerID === customerID &&
          principal.organizationID === tenant.organization_id
            ? principal.role
            : null,
      };
    },
  };
