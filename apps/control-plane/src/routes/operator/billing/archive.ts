import Elysia from "elysia";
import { readJSON } from "../../../plugins/body";
import { registryIdentity } from "../../../modules/registry/context";
export default new Elysia().post(
  "",
  async ({ request }) =>
    (await import("../../../modules/billing/catalog")).archiveProduct(
      registryIdentity(request),
      await readJSON(request, 8192),
    ),
  { parse: "none" },
);
