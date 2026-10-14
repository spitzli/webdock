import Elysia, { t } from "elysia";
import { readJSON } from "../../../plugins/body";
import { registryIdentity } from "../../../modules/registry/context";
export default new Elysia()
  .get(
    "",
    async ({ request, query }) =>
      (await import("../../../modules/billing/catalog")).listProducts(
        registryIdentity(request),
        query.environment,
      ),
    {
      query: t.Object({
        environment: t.Union([t.Literal("sandbox"), t.Literal("live")]),
      }),
    },
  )
  .post(
    "",
    async ({ request }) =>
      (await import("../../../modules/billing/catalog")).createProductVersion(
        registryIdentity(request),
        await readJSON(request, 32_768),
      ),
    { parse: "none" },
  );
