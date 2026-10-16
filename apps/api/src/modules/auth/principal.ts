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
