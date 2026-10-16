import { configurePayloadSSO } from "@webdock/payload-sso";
import { withDatabaseScope } from "@webdock/database-runtime";
import { database } from "../../db/runtime";
/** Read the existing mapping under the exact session verified by introspection. */
export function createPortalSession() {
  return configurePayloadSSO({
    successPath: "/",
    logoutPath: "/login",
    centralLogout: true,
    allowUnmappedPortalUsers: true,
    returnToPrefixes: [
      "/tenants",
      "/offers",
      "/people",
      "/sites",
      "/customers",
      "/projects",
      "/activity",
      "/integrations",
      "/infrastructure",
      "/hosting",
      "/operations",
    ],
    lookupUser: async (identity) => {
      if (!identity.sessionID || identity.role !== "operator") return null;
      return withDatabaseScope(
        {
          kind: "session",
          subject: identity.sub,
          sessionID: identity.sessionID,
        },
        async () => {
          if (process.env.DATABASE_RLS_SECRET)
            return (
              await database.query("SELECT webdock_rls.portal_user() AS value")
            ).rows[0].value;
          const result = await database.query(
            `SELECT id,name,email,role,auth_subject AS "authSubject",created_at AS "createdAt",updated_at AS "updatedAt" FROM webdock_admin.users WHERE auth_subject=$1 AND role='operator' LIMIT 2`,
            [identity.sub],
          );
          if (result.rows.length !== 1) return null;
          const row = result.rows[0];
          return {
            ...row,
            createdAt: new Date(row.createdAt).toISOString(),
            updatedAt: new Date(row.updatedAt).toISOString(),
          };
        },
      );
    },
  });
}
