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
    async verifyToken(token, config) {
      const claims = await verifyToken(token, {
        secretKey,
        jwtKey,
        authorizedParties: config.authorizedParties,
        audience: config.audience,
        clockSkewInMs: 0,
      });
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (
        claims.iss !== config.issuer ||
        typeof claims.azp !== "string" ||
        !config.authorizedParties.includes(claims.azp) ||
        (config.tokenMode !== "session" && !audiences.includes(config.audience))
      )
        throw Error(
          "Clerk token does not match the configured issuer, party or audience",
        );
      return claims;
    },
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
    async membership(organizationID, subject) {
      for (let offset = 0; offset <= 10000; offset += 100) {
        const page = await client.users.getOrganizationMembershipList({
          userId: subject,
          limit: 100,
          offset,
        });
        const member = page.data.find(
          (item) => item.organization.id === organizationID,
        );
        if (member)
          return {
            id: member.id,
            organizationID: member.organization.id,
            subject: member.publicUserData?.userId ?? "",
            role: member.role,
            permissions: member.permissions,
          };
        if (
          offset + page.data.length >= page.totalCount ||
          page.data.length === 0
        )
          return null;
      }
      throw Error("Clerk membership pagination limit exceeded");
    },
    async user(id) {
      const user = await client.users.getUser(id);
      const email = user.emailAddresses.find(
        (item) => item.id === user.primaryEmailAddressId,
      );
      return {
        id: user.id,
        role:
          user.privateMetadata?.webdockRole === "operator"
            ? "operator"
            : "user",
        banned: user.banned,
        locked: user.locked,
        twoFactorEnabled: user.twoFactorEnabled,
        emailVerified: email?.verification?.status === "verified",
      };
    },
  };
}
