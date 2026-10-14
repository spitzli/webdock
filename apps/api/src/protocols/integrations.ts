import { hostingCall } from "../modules/portal/hosting";
import { gitConnectionRoute } from "../modules/integrations/github/byok-routes";
import { POST as byokVercelConnect } from "./legacy-studio/hosting/vercel/connect";
import { vercelRegionEvent } from "../modules/integrations/vercel/events";
import {
  vercelConnect,
  vercelCallback,
  vercelDisconnect,
} from "../modules/integrations/vercel/vercel-routes";
import { GET as byokVercelCallback } from "./legacy-studio/hosting/vercel/callback";
import Elysia from "elysia";
import { withDatabaseScope } from "@webdock/database-runtime";
import type { ApiConfig } from "../config";
import type { Mount } from "../route-manifest";
import { createPortalSession } from "../modules/portal/session";
import { withNativeHeaders } from "../modules/portal/request-context";
import {
  githubConnect,
  githubCallback,
  githubDisconnect,
  githubSelect,
} from "../modules/integrations/github/routes";
export function integrationProtocols(config: ApiConfig): Mount[] {
  const sso = createPortalSession();
  const git = (step: "connect" | "callback" | "select") => (request: Request) =>
    gitConnectionRoute(request, step, {
      origin: config.studioOrigin,
      call: async (command) =>
        (await hostingCall(command)) as Record<string, unknown>,
    });
  const run = async (
    request: Request,
    handler: (request: Request) => Promise<Response>,
  ) => {
    let session;
    try {
      session = await sso.getDelegatedSession(request.headers);
    } catch {
      return new Response(null, { status: 503 });
    }
    if (!session?.sessionID) return new Response(null, { status: 401 });
    return withDatabaseScope(
      {
        kind: "session",
        subject: session.subject,
        sessionID: session.sessionID,
      },
      () =>
        withNativeHeaders(
          request.headers,
          () => handler(request),
          request.headers,
          session.accessToken,
        ),
    );
  };
  return [
    {
      host: config.studioOrigin,
      category: "auth_protocol",
      app: new Elysia()
        .post(
          "/api/github/connect",
          ({ request }) => run(request, githubConnect),
          { parse: "none" },
        )
        .get("/api/github/callback", ({ request }) =>
          run(request, githubCallback),
        )
        .post(
          "/api/github/disconnect",
          ({ request }) => run(request, githubDisconnect),
          { parse: "none" },
        )
        .post(
          "/api/github/select",
          ({ request }) => run(request, githubSelect),
          { parse: "none" },
        )
        .post(
          "/api/vercel/connect",
          ({ request }) => run(request, vercelConnect),
          { parse: "none" },
        )
        .get("/api/vercel/callback", ({ request }) =>
          run(request, vercelCallback),
        )
        .post(
          "/api/vercel/disconnect",
          ({ request }) => run(request, vercelDisconnect),
          { parse: "none" },
        )
        .post(
          "/api/hosting/git/connect",
          ({ request }) => run(request, git("connect")),
          { parse: "none" },
        )
        .get("/api/hosting/git/callback", ({ request }) =>
          run(request, git("callback")),
        )
        .post(
          "/api/hosting/git/select",
          ({ request }) => run(request, git("select")),
          { parse: "none" },
        )
        .post(
          "/api/hosting/vercel/connect",
          ({ request }) => run(request, byokVercelConnect),
          { parse: "none" },
        )
        .get("/api/hosting/vercel/callback", ({ request }) =>
          run(request, byokVercelCallback),
        ),
    },
    {
      host: config.studioOrigin,
      category: "signed_webhook",
      app: new Elysia().post(
        "/api/vercel/events",
        ({ request }) => vercelRegionEvent(request),
        { parse: "none" },
      ),
    },
  ];
}
