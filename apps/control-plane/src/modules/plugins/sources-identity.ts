import type { DatabaseScope } from "@webdock/database-runtime";
import { sourceFail } from "./sources-policy";

/** Auth subjects own RLS rows; Registry profiles separately own GitHub cookies. */
export function sourceOperatorIdentity(
  actor: {
    identity: { subject: string; sessionID: string };
    user: { id: string };
  },
  scope: DatabaseScope | undefined,
  expectedSubject?: string,
) {
  if (
    scope?.kind !== "session" ||
    scope.subject !== actor.identity.subject ||
    scope.sessionID !== actor.identity.sessionID ||
    (expectedSubject !== undefined && scope.subject !== expectedSubject)
  )
    sourceFail(
      "permission_denied",
      "A current operator session is required.",
      403,
    );
  return { id: scope.subject, registryID: actor.user.id, scope };
}
