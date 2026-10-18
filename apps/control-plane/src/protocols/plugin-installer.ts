import Elysia from "elysia";
import type { ApiConfig } from "../config";
import type { Mount } from "../route-manifest";
import { HTTPError, readJSON } from "../plugins/body";
import {
  installerAuthorized,
  PluginSourceError,
} from "../modules/plugins/sources-policy";
export function pluginInstallerProtocol(
  config: ApiConfig,
  dispatch: (action: string, input: unknown) => Promise<unknown> = async (
    action,
    input,
  ) =>
    (await import("../modules/plugins/sources")).pluginInstaller(action, input),
): Mount {
  const app = new Elysia().post(
    "/v1/plugin-installer/:action",
    async ({ request, params }) => {
      const headers = { "cache-control": "no-store" };
      if (!installerAuthorized(request.headers.get("authorization")))
        return Response.json(
          {
            error: {
              code: "unauthorized",
              message: "Installer authentication required.",
            },
          },
          { status: 401, headers },
        );
      if (!["claim", "source", "complete", "lease"].includes(params.action))
        return new Response(null, { status: 404, headers });
      try {
        return Response.json(
          await dispatch(params.action, await readJSON(request, 512 * 1024)),
          { headers },
        );
      } catch (error) {
        return Response.json(
          {
            error: {
              code:
                error instanceof PluginSourceError
                  ? error.code
                  : "invalid_request",
              message:
                error instanceof PluginSourceError
                  ? error.message
                  : "Plugin installer request failed.",
            },
          },
          {
            status:
              error instanceof PluginSourceError || error instanceof HTTPError
                ? error.status
                : 503,
            headers,
          },
        );
      }
    },
    { parse: "none" },
  );
  return { app, host: config.apiOrigin, category: "agent" };
}
