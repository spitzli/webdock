import Elysia from "elysia";
import type { ApiConfig } from "../config";
import type { Mount } from "../route-manifest";
/** Ignore provider session tokens entirely. A browser return never activates service. */
export function billingReturn(
  studioOrigin: string,
  request: Request,
): Response {
  const query = new URL(request.url).searchParams,
    environment = query.get("environment"),
    customer = query.get("customerID"),
    attempt = query.get("attemptID");
  if (
    !["sandbox", "live"].includes(environment || "") ||
    !customer ||
    !attempt ||
    ![customer, attempt].every((id) => /^[1-9]\d{0,18}$/.test(id))
  )
    return new Response(null, { status: 400 });
  const target = new URL("/tenants/" + customer + "/billing", studioOrigin);
  target.searchParams.set("environment", environment!);
  target.searchParams.set("attempt", attempt);
  return new Response(null, {
    status: 303,
    headers: {
      location: target.href,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}
export function billingReturnProtocol(config: ApiConfig): Mount {
  return {
    host: config.studioOrigin,
    category: "auth_protocol",
    app: new Elysia().get("/api/billing/return", ({ request }) =>
      billingReturn(config.studioOrigin, request),
    ),
  };
}
