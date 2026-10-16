import { auth } from "./auth";
import { currentMCPClaims } from "./mcp";
import { currentConsolePrincipal } from "./principal";
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
  const session = await auth.api.getSession({ headers });
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
