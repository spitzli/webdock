import {
  currentDatabaseScope,
  withDatabaseScope,
} from "@webdock/database-runtime";
import type { HostingActor } from "@webdock/hosting-contracts";
import type { MailActor } from "@webdock/mail-contracts";

/** Authentication stays on its bootstrap pool; business queries receive only verified identity. */
export async function withAuthenticatedDatabase<T>(
  headers: Headers,
  run: () => Promise<T>,
): Promise<T> {
  if (!process.env.DATABASE_RLS_SECRET && !process.env.CLERK_ISSUER)
    return run();
  const { getBusinessIdentity } =
    await import("../modules/auth/business-identity");
  const session = await getBusinessIdentity(headers);
  if (!session) {
    const { AccessError } = await import("../modules/access/access-management");
    throw new AccessError("Sign in and complete account setup first.");
  }
  const inherited = currentDatabaseScope();
  const memberships =
    session.provider === "legacy" &&
    !(
      inherited?.kind === "session" &&
      inherited.subject === session.user.id &&
      inherited.memberships
    )
      ? await (
          await import("../modules/auth/clerk-provider")
        ).legacyClerkMemberships(session.user.id)
      : undefined;
  return withDatabaseScope(
    {
      kind: "session",
      subject: session.user.id,
      sessionID: session.sessionID,
      ...(memberships ? { memberships } : {}),
    },
    run,
  );
}

export async function withHostingDatabase<T>(
  actor: HostingActor,
  run: () => Promise<T>,
): Promise<T> {
  // Git publication already runs inside an authenticated worker scope. It must not
  // manufacture a session or elevate an unscoped caller to worker authority.
  if (actor.source === "git-policy") return run();
  const scope = currentDatabaseScope();
  const principal = (
    await import("../modules/auth/principal")
  ).currentConsolePrincipal();
  if (principal && scope?.kind === "system") return run();
  const memberships = principal
    ? undefined
    : scope?.kind === "session" &&
        scope.subject === actor.subject &&
        scope.memberships
      ? scope.memberships
      : await (
          await import("../modules/auth/clerk-provider")
        ).legacyClerkMemberships(actor.subject);
  return withDatabaseScope(
    {
      kind: "session",
      subject: actor.subject,
      sessionID: actor.sessionID,
      ...(memberships ? { memberships } : {}),
    },
    run,
  );
}

export async function withMailDatabase<T>(
  actor: MailActor,
  run: () => Promise<T>,
): Promise<T> {
  const principal = actor.principal;
  if (principal.kind === "session") {
    const consolePrincipal = (
      await import("../modules/auth/principal")
    ).currentConsolePrincipal();
    const scope = currentDatabaseScope();
    const memberships = consolePrincipal
      ? undefined
      : scope?.kind === "session" &&
          scope.subject === principal.userID &&
          scope.memberships
        ? scope.memberships
        : await (
            await import("../modules/auth/clerk-provider")
          ).legacyClerkMemberships(principal.userID);
    return withDatabaseScope(
      {
        kind: "session",
        subject: principal.userID,
        sessionID: principal.sessionID,
        ...(memberships ? { memberships } : {}),
      },
      run,
    );
  }
  if (principal.kind === "api_key")
    return withDatabaseScope(
      {
        kind: "mail-key",
        customerID: actor.customerID,
        connectionID: actor.connectionID,
        keyID: principal.keyID,
      },
      run,
    );
  // Job actors carry no credential. The authenticated dispatcher supplies scope.
  return run();
}
