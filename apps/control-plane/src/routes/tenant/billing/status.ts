import Elysia, { t } from "elysia";
import { registryIdentity } from "../../../modules/registry/context";
export default new Elysia().get(
  "",
  async ({ request, query }) =>
    (await import("../../../modules/billing/view")).tenantBilling(
      registryIdentity(request),
      query,
    ),
  {
    query: t.Object({
      environment: t.Union([t.Literal("sandbox"), t.Literal("live")]),
      customerID: t.String({ pattern: "^[1-9][0-9]{0,18}$" }),
    }),
  },
);
