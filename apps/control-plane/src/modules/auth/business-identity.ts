import { auth } from "./auth";
import { currentMCPClaims } from "./mcp";
import { resolveSessionReference, currentConsolePrincipal } from "./principal";
export async function getBusinessIdentity(headers: Headers) {
  const principal = currentConsolePrincipal();
  if (principal)
    return {
      provider: "clerk" as const,
      sessionID: principal.sessionID,
      user: {
        id: principal.userID,
        name: principal.name,
        email: principal.email,
        role: principal.operator ? "operator" : "user",
        banned: false,
        emailVerified: true,
        twoFactorEnabled: false,
        mustChangePassword: false,
      },
    };
  const reference = await resolveSessionReference(headers);
  if (!reference) return null;
  const session = await auth.api.getSession({ headers });
  if (session?.user.id !== reference.subject || session.session.id !== reference.sessionID) return null;
  return session
    ? {
        provider: "legacy" as const,
        user: session.user,
        sessionID: session.session.id,
      }
    : null;
}
export async function businessOperator(subject: string | undefined) {
  const principal = currentConsolePrincipal();
  if (principal)
    return { disabled: principal.userID !== subject || !principal.operator };
  return currentMCPClaims(subject);
}
