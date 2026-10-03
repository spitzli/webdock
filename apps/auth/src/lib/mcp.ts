import { database } from "./db";
export const mcpResource = process.env.WEBDOCK_MCP_RESOURCE || "https://studio.webdock.dev/api/mcp";
export const mcpScopes = ["webdock:read", "webdock:write"] as const;

// Re-evaluate operator authorization on every resource request, including JWTs.
export async function currentMCPClaims(subject: string | undefined) {
  if (!subject) return { disabled: true };
  const { rows } = await database.query(
    `SELECT role,banned,"emailVerified","twoFactorEnabled","mustChangePassword" FROM webdock_auth."user" WHERE id=$1`, [subject],
  );
  const user = rows[0];
  return user && user.role === "operator" && !user.banned && user.emailVerified && user.twoFactorEnabled && !user.mustChangePassword
    ? { webdock_role: "operator", disabled: false }
    : { disabled: true };
}
