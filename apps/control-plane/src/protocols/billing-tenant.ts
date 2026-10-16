import Elysia from "elysia";
import { fileURLToPath } from "node:url";
import type { ApiConfig } from "../config";
import type { Mount } from "../route-manifest";
import { loadRoutes } from "../route-preflight";
import { createPortalSession } from "../modules/portal/session";
import { setRegistryIdentity } from "../modules/registry/context";
export async function tenantBillingProtocol(config: ApiConfig): Promise<Mount> {
  const sso = createPortalSession();
  const routes = await loadRoutes(
    fileURLToPath(new URL("../routes/tenant/billing", import.meta.url)),
  );
  return {
    host: config.apiOrigin,
    category: "tenant",
    app: new Elysia({ prefix: "/v1/tenant/billing" }).use(routes.app),
    guard: async (request) => {
      try {
        const identity = await sso.getDelegatedSession(request.headers);
        if (!identity?.sessionID) return new Response(null, { status: 401 });
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
