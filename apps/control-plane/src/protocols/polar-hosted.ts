import Elysia from "elysia";
import { requireInstalledOperation } from "../installation";
import { webhooks } from "@polar-sh/sdk/2026-10";
import { z } from "zod";
import type { ApiConfig } from "../config";
import type { Mount } from "../route-manifest";
import { hostedPolarClient } from "../modules/billing/hosted-client";

const productsSchema = z.array(z.uuid()).min(1).max(10);
export type HostedPolarDependencies = {
  createCheckout(input: { products: string[] }): Promise<{ url: string }>;
  webhookSecret(): string;
  requireCheckout(): void;
};
export function hostedPolarProtocols(
  config: Pick<ApiConfig, "apiOrigin">,
  dependencies: Partial<HostedPolarDependencies> = {},
): Mount[] {
  const createCheckout =
    dependencies.createCheckout ??
    ((input: { products: string[] }) =>
      hostedPolarClient().checkouts.create(input));
  const webhookSecret =
    dependencies.webhookSecret ??
    (() => process.env.POLAR_WEBHOOK_SECRET || "");
  const requireCheckout =
    dependencies.requireCheckout ??
    (() => requireInstalledOperation("billing.checkout", []));
  return [
    {
      host: config.apiOrigin,
      category: "public",
      app: new Elysia().get("/checkout", async ({ request }) => {
        try {
          requireCheckout();
        } catch {
          return Response.json(
            { error: "Checkout is temporarily unavailable." },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          );
        }
        const products = productsSchema.safeParse(
          new URL(request.url).searchParams.getAll("products"),
        );
        if (!products.success)
          return Response.json(
            { error: "Provide valid product IDs." },
            { status: 400 },
          );
        try {
          const checkout = await createCheckout({
            products: products.data,
          });
          if (new URL(checkout.url).protocol !== "https:")
            throw Error("Invalid checkout URL");
          return Response.redirect(checkout.url, 302);
        } catch {
          return Response.json(
            { error: "Checkout is temporarily unavailable." },
            { status: 502 },
          );
        }
      }),
    },
    {
      host: config.apiOrigin,
      category: "signed_webhook",
      app: new Elysia().post(
        "/api/webhook/polar",
        async ({ request }) => {
          const secret = webhookSecret();
          if (!secret) return new Response(null, { status: 503 });
          const maximum = 1_048_576;
          if (Number(request.headers.get("content-length")) > maximum)
            return new Response(null, { status: 413 });
          const body = new Uint8Array(await request.arrayBuffer());
          if (body.byteLength > maximum)
            return new Response(null, { status: 413 });
          let event;
          try {
            event = await webhooks.validateEvent(
              body,
              {
                "webhook-id": request.headers.get("webhook-id") || "",
                "webhook-timestamp":
                  request.headers.get("webhook-timestamp") || "",
                "webhook-signature":
                  request.headers.get("webhook-signature") || "",
              },
              secret,
            );
          } catch {
            return Response.json({ received: false }, { status: 403 });
          }
          switch (event.type) {
            case "order.paid":
              // TODO: Map hosted-checkout orders to application access after approval.
              break;
            case "customer.state_changed":
              // TODO: Map customer state to application users after approval.
              break;
          }
          return Response.json({ received: true });
        },
        { parse: "none" },
      ),
    },
  ];
}
