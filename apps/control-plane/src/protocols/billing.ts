import Elysia from "elysia";
import { fileURLToPath } from "node:url";
import type { ApiConfig } from "../config";
import type { Mount } from "../route-manifest";
import { loadRoutes } from "../route-preflight";
import { createPortalSession } from "../modules/portal/session";
import { setRegistryIdentity } from "../modules/registry/context";
export async function billingProtocol(config: ApiConfig): Promise<Mount> {
  const sso = createPortalSession();
  const routes = await loadRoutes(
    fileURLToPath(new URL("../routes/operator/billing", import.meta.url)),
  );
  return {
    host: config.apiOrigin,
    category: "operator",
    app: new Elysia({ prefix: "/v1/operator/billing" }).use(routes.app),
    guard: async (request) => {
      try {
        const identity = await sso.getDelegatedSession(request.headers);
        if (!identity?.sessionID) return new Response(null, { status: 401 });
        if (identity.role !== "operator")
          return new Response(null, { status: 403 });
        setRegistryIdentity(request, {
          subject: identity.subject,
          sessionID: identity.sessionID,
        });
      } catch {
        return new Response(null, { status: 503 });
      }
    },
  };
}
