import Elysia from "elysia";
import { readJSON } from "../../../plugins/body";
import { registryIdentity } from "../../../modules/registry/context";
export default new Elysia().post(
  "",
  async ({ request }) =>
    (await import("../../../modules/billing/view")).resumeCheckout(
      registryIdentity(request),
      await readJSON(request, 16384),
    ),
  { parse: "none" },
);
