import { createIntegrationCallbackHandoff } from "./integration-callback-handoff";
import { installationRegistry } from "../installation";
import {
  browserAuthProvider,
  clerkBrowserSession,
} from "../modules/auth/clerk-runtime";
import { ClerkSessionUnavailable } from "../modules/auth/clerk-bridge";
import { withTrustedLocalSession } from "../modules/auth/principal";
import { createIntegrationBrowserRunner } from "./integration-browser";
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
  const sso =
    browserAuthProvider === "better-auth" ? createPortalSession() : null;
  const git = (step: "connect" | "callback" | "select") => (request: Request) =>
    gitConnectionRoute(request, step, {
      origin: config.studioOrigin,
      call: async (command) =>
        (await hostingCall(command)) as Record<string, unknown>,
    });
  const handoff =
    browserAuthProvider === "clerk"
      ? createIntegrationCallbackHandoff({
          origin: config.studioOrigin,
          consoleOrigin: config.consoleOrigin ?? config.studioOrigin,
          secret: process.env.BETTER_AUTH_SECRET ?? "",
        })
      : null;
  const callbacks: Record<string, (request: Request) => Promise<Response>> = {
    "/api/github/callback": githubCallback,
    "/api/vercel/callback": vercelCallback,
    "/api/hosting/git/callback": git("callback"),
    "/api/hosting/vercel/callback": byokVercelCallback,
  };
  const run = createIntegrationBrowserRunner({
    refreshCallback: (request) => handoff?.begin(request) ?? null,
    provider: browserAuthProvider,
    origin: config.studioOrigin,
    requireHosting: (intent) =>
      installationRegistry().require("hosting", intent),
    async clerk(headers) {
      try {
        const session = await clerkBrowserSession(headers);
        return {
          headers: session.headers,
          reference: {
            subject: session.actor.userID,
            sessionID: session.actor.sessionID,
          },
        };
      } catch (error) {
        if (error instanceof ClerkSessionUnavailable) return null;
        throw error;
      }
    },
    async legacy(headers) {
      const session = await sso!.getDelegatedSession(headers);
      return session?.sessionID
        ? {
            headers,
            reference: {
              subject: session.subject,
              sessionID: session.sessionID,
            },
            accessToken: session.accessToken,
          }
        : null;
    },
    withIdentity(identity, browser, kind, handler) {
      const dispatch = () =>
        withDatabaseScope({ kind: "session", ...identity.reference }, () =>
          withNativeHeaders(
            identity.headers,
            handler,
            browser,
            identity.accessToken,
          ),
        );
      return kind === "clerk"
        ? withTrustedLocalSession(
            identity.headers,
            identity.reference,
            kind,
            dispatch,
          )
        : dispatch();
    },
  });
  const resume: Mount[] = handoff
    ? [
        {
          host: config.apiOrigin,
          category: "delegated",
          app: new Elysia().post(
            "/v1/integrations/resume",
            async ({ request }) => {
              let response: Response;
              if (request.headers.get("origin") !== config.studioOrigin)
                response = new Response(null, { status: 403 });
              else if (
                !/^Bearer [A-Za-z0-9_.-]{1,16384}$/i.test(
                  request.headers.get("authorization") ?? "",
                )
              )
                response = new Response(null, { status: 401 });
              else {
                const target = handoff.read(request.headers);
                if (!target) response = new Response(null, { status: 400 });
                else {
                  const url = new URL(target, config.studioOrigin),
                    handler = callbacks[url.pathname];
                  response = handler
                    ? await run(
                        new Request(url, { headers: request.headers }),
                        "provision",
                        handler,
                        { refreshed: true },
                      )
                    : new Response(null, { status: 400 });
                }
              }
              const headers = new Headers(response.headers);
              headers.append("set-cookie", handoff.clear());
              headers.set("cache-control", "no-store");
              headers.set("referrer-policy", "no-referrer");
              return new Response(response.body, {
                status: response.status,
                headers,
              });
            },
            { parse: "none" },
          ),
        },
      ]
    : [];
  return [
    ...resume,
    {
      host: config.studioOrigin,
      category: "auth_protocol",
      app: new Elysia()
        .post(
          "/api/github/connect",
          ({ request }) => run(request, "provision", githubConnect),
          { parse: "none" },
        )
        .get("/api/github/callback", ({ request }) =>
          run(request, "provision", githubCallback),
        )
        .post(
          "/api/github/disconnect",
          ({ request }) => run(request, "access", githubDisconnect),
          { parse: "none" },
        )
        .post(
          "/api/github/select",
          ({ request }) => run(request, "provision", githubSelect),
          { parse: "none" },
        )
        .post(
          "/api/vercel/connect",
          ({ request }) => run(request, "provision", vercelConnect),
          { parse: "none" },
        )
        .get("/api/vercel/callback", ({ request }) =>
          run(request, "provision", vercelCallback),
        )
        .post(
          "/api/vercel/disconnect",
          ({ request }) => run(request, "access", vercelDisconnect),
          { parse: "none" },
        )
        .post(
          "/api/hosting/git/connect",
          ({ request }) => run(request, "provision", git("connect")),
          { parse: "none" },
        )
        .get("/api/hosting/git/callback", ({ request }) =>
          run(request, "provision", git("callback")),
        )
        .post(
          "/api/hosting/git/select",
          ({ request }) => run(request, "provision", git("select")),
          { parse: "none" },
        )
        .post(
          "/api/hosting/vercel/connect",
          ({ request }) => run(request, "provision", byokVercelConnect),
          { parse: "none" },
        )
        .get("/api/hosting/vercel/callback", ({ request }) =>
          run(request, "provision", byokVercelCallback),
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
