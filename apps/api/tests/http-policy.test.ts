import { expect, test } from "bun:test";
import Elysia from "elysia";
import { createApp } from "../src/app";
import { readConfig } from "../src/config";
const config = () =>
  readConfig({
    NODE_ENV: "test",
    WEBDOCK_API_ORIGIN: "http://localhost:3130",
    BETTER_AUTH_URL: "http://localhost:3125",
    WEBDOCK_STUDIO_ORIGIN: "http://localhost:3120",
  });
test("unknown hosts and forged forwarding metadata cannot reach a handler", async () => {
  const app = await createApp(config());
  expect(
    (await app.handle(new Request("http://evil.invalid/healthz"))).status,
  ).toBe(404);
  expect(
    (
      await app.handle(
        new Request("http://localhost:3130/healthz", {
          headers: { "x-forwarded-host": "auth.webdock.dev" },
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (await app.handle(new Request("http://localhost:3125/healthz"))).status,
  ).toBe(404);
});
test("health contains no infrastructure data and readiness fails without a working dependency", async () => {
  const app = await createApp(config(), {
    ready: async () => {
      throw Error("secret connection string");
    },
  });
  expect(
    await (
      await app.handle(new Request("http://localhost:3130/healthz"))
    ).json(),
  ).toEqual({ status: "ok" });
  const r = await app.handle(new Request("http://localhost:3130/readyz"));
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("secret");
});
test("protocol mounts receive original bytes and keep multiple cookies, while business mounts require guards", async () => {
  const echo = new Elysia().post(
    "/echo",
    async ({ request }) =>
      new Response(await request.text(), {
        headers: [
          ["set-cookie", "one=1; Path=/"],
          ["set-cookie", "two=2; Path=/"],
        ],
      }),
    { parse: "none" },
  );
  const app = await createApp(config(), {
    mounts: [
      { app: echo, host: "http://localhost:3130", category: "signed_webhook" },
    ],
  });
  const body = ' { "value" : "ä" }\n';
  const r = await app.handle(
    new Request("http://localhost:3130/echo", { method: "POST", body }),
  );
  expect(await r.text()).toBe(body);
  expect(r.headers.getSetCookie()).toHaveLength(2);
  await expect(
    createApp(config(), {
      mounts: [
        { app: echo, host: "http://localhost:3130", category: "tenant" },
      ],
    }),
  ).rejects.toThrow("guard");
});
test("business guard denies anonymous and cross-origin writes before the handler", async () => {
  const app = await createApp(config(), {
    mounts: [
      {
        app: new Elysia()
          .get("/private", () => "private")
          .post("/private", () => "private"),
        host: "http://localhost:3130",
        category: "tenant",
        guard: (request) =>
          request.headers.get("authorization") === "fixture"
            ? undefined
            : new Response(null, { status: 401 }),
      },
    ],
  });
  expect(
    (await app.handle(new Request("http://localhost:3130/private"))).status,
  ).toBe(401);
  expect(
    (
      await app.handle(
        new Request("http://localhost:3130/private", {
          method: "POST",
          headers: { authorization: "fixture", origin: "http://evil.invalid" },
        }),
      )
    ).status,
  ).toBe(403);
  expect(
    await (
      await app.handle(
        new Request("http://localhost:3130/private", {
          headers: { authorization: "fixture" },
        }),
      )
    ).text(),
  ).toBe("private");
});
test("separate route modules cannot overwrite a mounted protocol route", async () => {
  const a = () => ({
    app: new Elysia().get("/same", () => "one"),
    host: "http://localhost:3130",
    category: "public" as const,
  });
  await expect(createApp(config(), { mounts: [a(), a()] })).rejects.toThrow(
    "collision",
  );
});
test("unexpected handler failures have sanitized errors and request correlation", async () => {
  const app = await createApp(config(), {
    mounts: [
      {
        app: new Elysia().get("/fail", () => {
          throw Error("password=hunter2");
        }),
        host: "http://localhost:3130",
        category: "public",
      },
    ],
  });
  const r = await app.handle(
    new Request("http://localhost:3130/fail", {
      headers: { "x-request-id": "attacker" },
    }),
  );
  expect(r.status).toBe(500);
  expect(await r.text()).not.toContain("hunter2");
  expect(r.headers.get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
});
test("an ALL protocol mount cannot silently shadow a method-specific handler", async () => {
  const all = {
    app: new Elysia().all("/collision", () => "all"),
    host: "http://localhost:3130",
    category: "public" as const,
  };
  const get = {
    app: new Elysia().get("/collision", () => "get"),
    host: "http://localhost:3130",
    category: "public" as const,
  };
  await expect(createApp(config(), { mounts: [all, get] })).rejects.toThrow(
    "collision",
  );
});
