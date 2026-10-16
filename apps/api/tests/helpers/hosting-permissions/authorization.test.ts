import { expect, test } from "bun:test";
import { authorizeHosting, type Connection } from "../../../src/modules/hosting/authorization";
import { gitActionPermission, authorizeSetupConfiguration } from "../../../src/modules/hosting/permissions";
import { withStoredConsolePrincipal } from "../../../src/modules/auth/principal";
import type { ConsolePrincipal } from "../../../src/modules/auth/clerk-identity";
const actor = { subject: "1001", sessionID: "sess_one", source: "studio" as const, scopes: ["hosting:read", "hosting:write"] };
const principal: ConsolePrincipal = {
  provider: "clerk", issuer: "https://fixture.clerk.accounts.dev", userID: actor.subject,
  clerkUserID: "user_one", sessionID: actor.sessionID, operator: false,
  organizationID: "2001", clerkOrganizationID: "org_one", customerID: "3001",
  role: "admin", verifiedAt: Date.now(), expiresAt: Date.now() + 60000,
  name: "Fixture", email: "fixture@example.test", permissions: [],
};
function connection(mode = "selfservice", preview = false): Connection {
  return { query: async (sql: string) => {
    const rows = sql.includes('FROM webdock_auth."user"') ? [{ id: actor.subject, role: "user" }]
      : sql.includes("console_tenant_preview") ? preview ? [{ customer_id: "3001", organization_id: "2001", expires_at: new Date(Date.now()+60000) }] : []
      : sql.includes("FROM webdock_admin.projects") ? [{ id: "4001", customer_id: "3001", status: "active", mode }]
      : sql.includes("FROM webdock_admin.customers") ? [{ status: "active", organization_id: "2001" }] : [];
    return { rows, rowCount: rows.length };
  }} as Connection;
}
const write = (p: ConsolePrincipal, permission: "org:projects:manage" | "org:deployments:create" | "org:databases:manage", db=connection()) =>
  withStoredConsolePrincipal(p, () => authorizeHosting(actor, { projectID: "4001", write: true, permission }, db));
test("same admin role loses hosting management immediately when its capability is removed", async () => {
  expect((await write({...principal, permissions: ["org:projects:manage"]}, "org:projects:manage")).canWrite).toBe(true);
  await expect(write(principal, "org:projects:manage")).rejects.toThrow();
});
test("member capabilities authorize only their own domain", async () => {
  const member: ConsolePrincipal = {...principal, role: "member" as const, permissions: ["org:databases:manage"]};
  expect((await write(member, "org:databases:manage")).canWrite).toBe(true);
  await expect(write(member, "org:projects:manage")).rejects.toThrow();
  await expect(write(member, "org:deployments:create")).rejects.toThrow();
  await expect(write(member, "org:databases:manage", connection("managed"))).rejects.toThrow();
  await expect(write(member, "org:databases:manage", connection("selfservice", true))).rejects.toThrow();
});
test("unknown write domain denies and read capabilities reflect domain", async () => {
  await withStoredConsolePrincipal({...principal, permissions: ["org:projects:manage"]}, async () => {
    await expect(authorizeHosting(actor, { projectID: "4001", write: true }, connection())).rejects.toThrow();
    expect((await authorizeHosting(actor, { projectID: "4001", permission: "org:databases:manage" }, connection())).canWrite).toBe(false);
  });
  expect(gitActionPermission("git.source.configure")).toBe("org:projects:manage");
  expect(gitActionPermission("git.releases.rollback")).toBe("org:deployments:create");
  expect(gitActionPermission("git.unknown.write")).toBeUndefined();
});
test("setup selected database and Git operations require their own capabilities", async () => {
  await withStoredConsolePrincipal({...principal, permissions: ["org:projects:manage"]}, async () => {
    await expect(authorizeSetupConfiguration(connection(), actor, "4001", {database:{mode:"new"}, source:{kind:"template"}} as any)).rejects.toThrow();
    await expect(authorizeSetupConfiguration(connection(), actor, "4001", {database:{mode:"none"}, source:{kind:"git"}} as any)).rejects.toThrow();
  });
});
