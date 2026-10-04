import test from "node:test";
import assert from "node:assert/strict";
import { cmsFields, editableData, editorData } from "./schema";
import { cmsUser, handleCMSRequest } from "./server";
import type { Payload } from "payload";
const options = {
  siteName: "Test website",
  siteURL: "https://site.invalid",
  modules: [
    {
      kind: "collection" as const,
      slug: "pages",
      label: "Pages",
      titleField: "title",
    },
  ],
  locales: ["en", "de"],
  defaultLocale: "en",
};
test("CMS schema serializes fields without callbacks and rejects private/unknown writes", () => {
  const fields = cmsFields([
    {
      type: "tabs",
      tabs: [
        {
          label: "Content",
          fields: [
            { name: "title", type: "text", required: true },
            {
              name: "items",
              type: "array",
              fields: [{ name: "text", type: "textarea" }],
            },
            { name: "private", type: "text", admin: { hidden: true } },
          ],
        },
      ],
    },
  ]);
  assert.equal(JSON.stringify(fields).includes("private"), false);
  assert.throws(() => editableData(fields, { title: "x", private: "secret" }));
  assert.deepEqual(
    editableData(fields, { title: "x", items: [{ id: "row1", text: "Hi" }] }),
    { title: "x", items: [{ id: "row1", text: "Hi" }] },
  );
  assert.deepEqual(
    editorData(fields, { id: 9, title: "x", private: "secret", items: [] }),
    { title: "x", items: [] },
  );
});
test("CMS API requires current instance auth, respects reader rights, origin, module and locale boundaries", async () => {
  let role = "reader";
  let authed = true;
  let writes = 0;
  const p = {
    auth: async () => ({
      user: authed ? { id: "1", collection: "users", role } : null,
    }),
    config: { globals: [] },
    collections: {
      pages: {
        config: { fields: [{ name: "title", type: "text" }], versions: false },
      },
    },
    find: async (args: any) => {
      assert.equal(args.overrideAccess, false);
      assert.equal(args.user.role, role);
      return { docs: [{ id: 1, title: "Test" }], totalPages: 1 };
    },
    create: async () => {
      writes++;
      return { id: 2 };
    },
    db: {},
  } as unknown as Payload;
  const call = (
    method: string,
    query = "",
    data?: unknown,
    origin = "https://site.invalid",
  ) =>
    handleCMSRequest(
      new Request("https://site.invalid/api/cms" + query, {
        method,
        headers: { origin, "content-type": "application/json" },
        ...(data ? { body: JSON.stringify(data) } : {}),
      }),
      options,
      async () => p,
    );
  assert.equal((await call("GET", "?module=pages")).status, 200);
  assert.equal(
    (
      await call("POST", "", {
        module: "pages",
        data: { title: "x" },
        mode: "save",
      })
    ).status,
    403,
  );
  role = "editor";
  assert.equal(
    (
      await call(
        "POST",
        "",
        { module: "pages", data: { title: "x" }, mode: "save" },
        "https://attacker.invalid",
      )
    ).status,
    403,
  );
  assert.equal((await call("GET", "?module=users")).status, 404);
  assert.equal((await call("GET", "?module=pages&locale=zz")).status, 400);
  assert.equal(
    (await call("DELETE", "", { module: "pages", id: "1" })).status,
    403,
  );
  authed = false;
  assert.equal(await cmsUser(p, new Headers()), null);
  assert.equal((await call("GET")).status, 401);
  assert.equal(writes, 0);
});
