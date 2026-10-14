import Elysia from "elysia";
import type { ApiConfig } from "../../config";
import type { Mount } from "../../route-manifest";
import { receiveWebhook } from "../../modules/billing/webhooks";
export function polarWebhooks(config: ApiConfig): Mount {
  return {
    host: config.apiOrigin,
    category: "signed_webhook",
    app: new Elysia()
      .post(
        "/webhooks/polar",
        ({ request }) => receiveWebhook("live", request),
        { parse: "none" },
      )
      .post(
        "/webhooks/polar/sandbox",
        ({ request }) => receiveWebhook("sandbox", request),
        { parse: "none" },
      ),
  };
}
