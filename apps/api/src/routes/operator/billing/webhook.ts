import Elysia from "elysia";
import { readJSON } from "../../../plugins/body";
import { registryIdentity } from "../../../modules/registry/context";
export default new Elysia().post(
  "",
  async ({ request }) =>
    (await import("../../../modules/billing/endpoints")).setupEndpoint(
      registryIdentity(request),
      await readJSON(request, 16_384),
    ),
  { parse: "none" },
);
