import Elysia, { t } from "elysia";
import { readJSON } from "../../../plugins/body";
import { registryIdentity } from "../../../modules/registry/context";
const query = t.Object({
  environment: t.Union([t.Literal("sandbox"), t.Literal("live")]),
});
export default new Elysia()
  .get(
    "",
    async ({ request, query }) =>
      (await import("../../../modules/billing/connection")).connectionStatus(
        registryIdentity(request),
        query.environment,
      ),
    { query },
  )
  .post(
    "",
    async ({ request }) =>
      (await import("../../../modules/billing/connection")).saveConnection(
        registryIdentity(request),
        await readJSON(request, 16_384),
      ),
    { parse: "none" },
  )
  .patch(
    "",
    async ({ request }) =>
      (await import("../../../modules/billing/connection")).updateSwitches(
        registryIdentity(request),
        await readJSON(request, 8192),
      ),
    { parse: "none" },
  );
