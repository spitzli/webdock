import { withDatabaseScope } from "@webdock/database-runtime";
import type { HostingActor } from "@webdock/hosting-contracts";
import type { MailActor } from "@webdock/mail-contracts";

/** Authentication stays on its bootstrap pool; business queries receive only verified identity. */
export async function withAuthenticatedDatabase<T>(
  headers: Headers,
  run: () => Promise<T>,
): Promise<T> {
  if (!process.env.DATABASE_RLS_SECRET) return run();
  const { auth } = await import("./auth");
  const session = await auth.api.getSession({ headers });
  if (!session) {
    const { AccessError } = await import("./access-management");
    throw new AccessError("Sign in and complete account setup first.");
  }
  return withDatabaseScope(
    {
      kind: "session",
      subject: session.user.id,
      sessionID: session.session.id,
    },
    run,
  );
}

export function withHostingDatabase<T>(
  actor: HostingActor,
  run: () => Promise<T>,
): Promise<T> {
  // Git publication already runs inside an authenticated worker scope. It must not
  // manufacture a session or elevate an unscoped caller to worker authority.
  if (actor.source === "git-policy") return run();
  return withDatabaseScope(
    { kind: "session", subject: actor.subject, sessionID: actor.sessionID },
    run,
  );
}

export function withMailDatabase<T>(
  actor: MailActor,
  run: () => Promise<T>,
): Promise<T> {
  const principal = actor.principal;
  if (principal.kind === "session")
    return withDatabaseScope(
      {
        kind: "session",
        subject: principal.userID,
        sessionID: principal.sessionID,
      },
      run,
    );
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
