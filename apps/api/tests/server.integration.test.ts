import { test, expect } from "bun:test";
import { randomBytes } from "node:crypto";
import { assertTestDatabase } from "./helpers/database";
const enabled = process.env.API_TEST_DATABASE_URL;
(enabled ? test : test.skip)(
  "network server preserves Auth host cookies and serves a redacted frontend session",
  async () => {
    assertTestDatabase(process.env.API_TEST_DATABASE_URL!);
    const reservation = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response(null),
    });
    const port = reservation.port;
    await reservation.stop();
    const apiOrigin = `http://127.0.0.1:${port}`,
      authOrigin = "http://localhost:3125",
      ingressSecret = randomBytes(32).toString("hex");
    const { createIdentity } = await import("../src/modules/auth/bootstrap");
    const { database, closeDatabases } = await import("../src/db/runtime");
    const email = "http-" + randomBytes(6).toString("hex") + "@example.invalid",
      password = randomBytes(24).toString("hex");
    const user = await createIdentity({
      name: "HTTP fixture",
      email,
      password,
      mustChangePassword: false,
    });
    const child = Bun.spawn(
      [
        process.execPath,
        "--no-env-file",
        new URL("../src/index.ts", import.meta.url).pathname,
      ],
      {
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: "development",
          DATABASE_URL: process.env.API_TEST_DATABASE_URL,
          AUTH_TEST_MAIL: "true",
          BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
          BETTER_AUTH_URL: authOrigin,
          WEBDOCK_API_ORIGIN: apiOrigin,
          WEBDOCK_STUDIO_ORIGIN: "http://localhost:3120",
          WEBDOCK_API_DOMAINS: "auth",
          WEBDOCK_INGRESS_SECRET: ingressSecret,
          WEBDOCK_TRUSTED_PROXIES: "127.0.0.1/32",
          PORT: String(port),
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    try {
      let ready = false;
      for (let n = 0; n < 100; n++) {
        try {
          ready = (await fetch(apiOrigin + "/readyz")).ok;
          if (ready) break;
        } catch {}
        await Bun.sleep(50);
      }
      expect(ready).toBe(true);
      const headers = {
        "x-forwarded-host": "localhost:3125",
        "x-forwarded-proto": "http",
        "x-forwarded-for": "192.0.2.20",
        "x-webdock-ingress-token": ingressSecret,
        origin: authOrigin,
        "content-type": "application/json",
      };
      const discovery = await fetch(
        apiOrigin + "/.well-known/openid-configuration",
        { headers, redirect: "manual" },
      );
      expect(discovery.status).toBe(200);
      expect((await discovery.json()).issuer).toBe(authOrigin + "/api/auth");
      const login = await fetch(apiOrigin + "/api/auth/sign-in/email", {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password }),
        redirect: "manual",
      });
      expect(login.status).toBe(200);
      const cookies = login.headers.getSetCookie();
      expect(cookies.length).toBeGreaterThan(0);
      expect(cookies.join(";")).not.toContain("Domain=");
      const session = await fetch(apiOrigin + "/v1/auth/session", {
        headers: {
          cookie: cookies.map((value) => value.split(";")[0]).join("; "),
        },
      });
      const body = await session.json();
      expect(body.data.user.id).toBe(user.id);
      expect(body.data.session).not.toHaveProperty("token");
      expect((await fetch(apiOrigin + "/api/auth/get-session")).status).toBe(
        404,
      );
    } finally {
      child.kill("SIGTERM");
      const exit = await child.exited;
      if (exit !== 0) console.error(await new Response(child.stderr).text());
      await database.query('DELETE FROM webdock_auth."user" WHERE id=$1', [
        user.id,
      ]);
      await closeDatabases();
    }
  },
  15_000,
);
