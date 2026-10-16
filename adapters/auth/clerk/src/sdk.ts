import { createClerkClient, verifyToken } from "@clerk/backend";
import type { ClerkBackend } from "./index";
/** Construct only after explicit configuration; no account creation, environment reads or import-time calls. */
export function createClerkBackend(
  secretKey: string,
  jwtKey?: string,
): ClerkBackend {
  if (!secretKey || !/^sk_(live|test)_/.test(secretKey))
    throw Error("Configured Clerk backend secret required");
  const client = createClerkClient({ secretKey });
  return {
    verifyToken: (token, config) =>
      verifyToken(token, {
        secretKey,
        jwtKey,
        authorizedParties: config.authorizedParties,
        audience: config.audience,
        clockSkewInMs: 0,
      }),
    async session(id) {
      const session = await client.sessions.getSession(id);
      return {
        id: session.id,
        userId: session.userId,
        status: session.status,
        expireAt: session.expireAt,
        actor: session.actor,
      };
    },
    async user(id) {
      const user = await client.users.getUser(id);
      const email = user.emailAddresses.find(
        (item) => item.id === user.primaryEmailAddressId,
      );
      return {
        id: user.id,
        banned: user.banned,
        locked: user.locked,
        twoFactorEnabled: user.twoFactorEnabled,
        emailVerified: email?.verification?.status === "verified",
      };
    },
  };
}
