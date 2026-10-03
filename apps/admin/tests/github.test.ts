import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { configureGitHub } from "../src/lib/github";

const options = {
  clientID: "Iv1.webdock",
  clientSecret: "client-secret",
  appSlug: "webdock-studio",
  origin: "https://admin.example.test",
  cookieSecret: "cookie-secret-with-at-least-thirty-two-characters",
};
const actor = "1001";
const cookieHeader = (response: Response) =>
  response.headers
    .getSetCookie()
    .filter((c) => !c.includes("Max-Age=0"))
    .map((c) => c.split(";")[0])
    .join("; ");
const request = (path: string, cookie = "", method = "GET") =>
  new Request(`${options.origin}${path}`, {
    method,
    headers: { cookie, origin: options.origin },
  });

test("GitHub state uses PKCE and secure cookies, is owner bound, and rejects cross-origin connect", async () => {
  const github = configureGitHub(options);
  assert.equal(
    (
      await github.connect(
        new Request(`${options.origin}/api/github/connect`, {
          method: "POST",
          headers: { origin: "https://evil.test" },
        }),
        actor,
      )
    ).status,
    403,
  );
  const start = await github.connect(
    request("/api/github/connect", "", "POST"),
    actor,
  );
  assert.equal(start.status, 303);
  const url = new URL(start.headers.get("location")!);
  assert.equal(url.origin, "https://github.com");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.has("scope"), false);
  assert.match(
    start.headers.get("set-cookie")!,
    /^__Host-webdock-github-flow=/,
  );
  assert.match(
    start.headers.get("set-cookie")!,
    /HttpOnly; Secure; SameSite=Lax/,
  );
  assert.ok(!start.headers.get("set-cookie")!.includes("Domain="));
  const callback = request(
    `/api/github/callback?code=code&state=${url.searchParams.get("state")}`,
    cookieHeader(start),
  );
  assert.match(
    (await github.callback(callback, "another-operator")).headers.get(
      "location",
    )!,
    /github=failed$/,
  );
  assert.match(
    (
      await github.callback(
        request(
          "/api/github/callback?code=code&state=wrong",
          cookieHeader(start),
        ),
        actor,
      )
    ).headers.get("location")!,
    /github=failed$/,
  );
});

test("GitHub user tokens remain encrypted, expire, and repository selection rechecks installation access", async (t) => {
  let challenge = "";
  let allowRepository = true;
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls++;
      assert.equal(init?.redirect, "error");
      assert.equal(init?.cache, "no-store");
      if (url === "https://github.com/login/oauth/access_token") {
        const body = new URLSearchParams(String(init?.body));
        assert.equal(
          createHash("sha256")
            .update(body.get("code_verifier")!)
            .digest("base64url"),
          challenge,
        );
        assert.equal(
          body.get("redirect_uri"),
          `${options.origin}/api/github/callback`,
        );
        return Response.json({
          access_token: "ghu_secret_user_token",
          token_type: "bearer",
          scope: "",
          expires_in: 28800,
          refresh_token: "ghr_never-store",
        });
      }
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer ghu_secret_user_token",
      );
      if (url === "https://api.github.com/user")
        return Response.json({ id: 42, login: "operator-github" });
      if (
        url === "https://api.github.com/user/installations?per_page=50&page=1"
      )
        return Response.json({
          total_count: 1,
          installations: [
            {
              id: 7,
              app_slug: options.appSlug,
              account: { login: "my-org" },
              suspended_at: null,
              permissions: { metadata: "read" },
            },
          ],
        });
      if (
        url ===
        "https://api.github.com/user/installations/7/repositories?per_page=50&page=1"
      )
        return Response.json({
          total_count: allowRepository ? 1 : 0,
          repositories: allowRepository
            ? [
                {
                  id: 11,
                  full_name: "my-org/site",
                  private: true,
                  html_url: "https://github.com/my-org/site",
                },
              ]
            : [],
        });
      throw Error(`Unexpected request: ${url}`);
    },
  );
  const github = configureGitHub(options);
  const start = await github.connect(
    request("/api/github/connect", "", "POST"),
    actor,
  );
  const url = new URL(start.headers.get("location")!);
  challenge = url.searchParams.get("code_challenge")!;
  const connected = await github.callback(
    request(
      `/api/github/callback?state=${url.searchParams.get("state")}&code=code`,
      cookieHeader(start),
    ),
    actor,
  );
  assert.match(connected.headers.get("location")!, /github=connected$/);
  assert.ok(!connected.headers.get("set-cookie")!.includes("ghu_"));
  assert.ok(!connected.headers.get("set-cookie")!.includes("ghr_"));
  assert.match(
    connected.headers
      .getSetCookie()
      .find((c) => c.startsWith("__Host-webdock-github="))!,
    /Max-Age=28800/,
  );
  const headers = new Headers({ cookie: cookieHeader(connected) });
  const session = await github.session(headers, actor);
  assert.equal(session?.login, "operator-github");
  assert.equal(await github.session(headers, "another-operator"), null);
  assert.equal(
    await github.session(
      new Headers({
        cookie: `${headers.get("cookie")}; ${headers.get("cookie")}`,
      }),
      actor,
    ),
    null,
  );
  const repository = await github.repository(session!, {
    installation: 7,
    installationPage: 1,
    page: 1,
    repository: 11,
  });
  assert.equal(repository.url, "https://github.com/my-org/site");
  const before = calls;
  await assert.rejects(() =>
    github.repository(session!, {
      installation: 999,
      installationPage: 1,
      page: 1,
      repository: 11,
    }),
  );
  assert.equal(calls, before + 1);
  allowRepository = false;
  await assert.rejects(() =>
    github.repository(session!, {
      installation: 7,
      installationPage: 1,
      page: 1,
      repository: 11,
    }),
  );
  const currentTime = Date.now();
  const clock = t.mock.method(Date, "now", () => currentTime + 28801 * 1000);
  assert.equal(await github.session(headers, actor), null);
  clock.mock.restore();
  const disconnected = github.disconnect(
    request("/api/github/disconnect", "", "POST"),
  );
  assert.equal(disconnected.status, 303);
  assert.ok(
    disconnected.headers.getSetCookie().every((c) => c.includes("Max-Age=0")),
  );
});

test("GitHub configuration rejects unsafe origins and weak cookie secrets", () => {
  for (const change of [
    { origin: "https://evil.test/path" },
    { origin: "http://remote.test" },
    { cookieSecret: "short" },
    { appSlug: "../../evil" },
  ]) {
    assert.throws(() => configureGitHub({ ...options, ...change }));
  }
});

test("repository linking changes only the verified URL through audited, access-controlled Payload operations", async () => {
  const { linkGitHubRepository } = await import("../src/lib/github-project");
  const writes: unknown[] = [];
  const user = { id: actor, collection: "users", role: "operator" };
  const payload = {
    findByID: async (args: unknown) => {
      writes.push(args);
      return { id: "123", status: "active" };
    },
    update: async (args: unknown) => {
      writes.push(args);
      return { id: "123" };
    },
  };
  const github = {
    repository: async () => ({ url: "https://github.com/my-org/verified" }),
  };
  const session = { operatorID: actor };
  const selection = {
    project: "123",
    installation: "7",
    installationPage: "1",
    page: "1",
    repository: "11",
  };
  await linkGitHubRepository(
    { payload, user } as never,
    github as never,
    session as never,
    selection,
  );
  assert.deepEqual(writes[1], {
    collection: "projects",
    id: "123",
    data: { repositoryURL: "https://github.com/my-org/verified" },
    user,
    overrideAccess: false,
  });
  await assert.rejects(() =>
    linkGitHubRepository(
      { payload, user: { ...user, role: "editor" } } as never,
      github as never,
      session as never,
      selection,
    ),
  );
  await assert.rejects(() =>
    linkGitHubRepository(
      { payload, user } as never,
      github as never,
      session as never,
      { ...selection, repositoryURL: "https://evil.test" },
    ),
  );
  await assert.rejects(() =>
    linkGitHubRepository(
      { payload, user } as never,
      {
        repository: async () => {
          throw Error("Revoked");
        },
      } as never,
      session as never,
      selection,
    ),
  );
  assert.equal(writes.length, 2);
});

test("GitHub rejects PATs, non-expiring tokens and over-permissioned installations", async (t) => {
  let responseToken: Record<string, unknown> = {};
  let installationPermissions: Record<string, string> = {
    metadata: "read",
    contents: "write",
  };
  t.mock.method(globalThis, "fetch", async (input: Request | URL | string) => {
    if (String(input) === "https://github.com/login/oauth/access_token")
      return Response.json(responseToken);
    if (String(input).startsWith("https://api.github.com/user/installations?"))
      return Response.json({
        total_count: 1,
        installations: [
          {
            id: 7,
            app_slug: options.appSlug,
            account: { login: "my-org" },
            permissions: installationPermissions,
          },
        ],
      });
    throw Error("Invalid token must not reach the user API");
  });
  const github = configureGitHub(options);
  for (const token of [
    {
      access_token: "ghp_pat",
      token_type: "bearer",
      scope: "",
      expires_in: 28800,
    },
    { access_token: "ghu_no_expiry", token_type: "bearer", scope: "" },
    {
      access_token: "ghu_too_long",
      token_type: "bearer",
      scope: "",
      expires_in: 28801,
    },
    {
      access_token: "ghu_has_scope",
      token_type: "bearer",
      scope: "repo",
      expires_in: 28800,
    },
  ]) {
    responseToken = token;
    const start = await github.connect(
      request("/api/github/connect", "", "POST"),
      actor,
    );
    const state = new URL(start.headers.get("location")!).searchParams.get(
      "state",
    );
    const failed = await github.callback(
      request(
        `/api/github/callback?code=code&state=${state}`,
        cookieHeader(start),
      ),
      actor,
    );
    assert.match(failed.headers.get("location")!, /github=failed$/);
    assert.ok(
      failed.headers
        .getSetCookie()
        .every((cookie) => cookie.startsWith("__Host-webdock-github-flow=")),
    );
  }
  const session = {
    accessToken: "ghu_fake",
    exp: Math.floor(Date.now() / 1000) + 300,
  } as never;
  await assert.rejects(
    () => github.installations(session),
    /Metadata: read-only/,
  );
  installationPermissions = { metadata: "read" };
  assert.equal((await github.installations(session)).items[0]?.id, 7);
});

test("GitHub callback rejects duplicated parameters, wrong hosts and expired flows before token exchange", async (t) => {
  let exchanges = 0;
  t.mock.method(globalThis, "fetch", async () => {
    exchanges++;
    throw Error("Invalid flow must never exchange a token");
  });
  const github = configureGitHub(options);
  const start = await github.connect(
    request("/api/github/connect", "", "POST"),
    actor,
  );
  const state = new URL(start.headers.get("location")!).searchParams.get(
    "state",
  )!;
  const flowCookie = cookieHeader(start);
  const path = `/api/github/callback?code=code&state=${state}`;
  for (const incoming of [
    request(`${path}&state=${state}`, flowCookie),
    request(`${path}&code=second`, flowCookie),
    request(`${path}&error=access_denied`, flowCookie),
    request(path, `${flowCookie}; ${flowCookie}`),
    new Request(`https://attacker.invalid${path}`, {
      headers: { cookie: flowCookie },
    }),
    request(path, flowCookie, "POST"),
  ]) {
    const response = await github.callback(incoming, actor);
    assert.equal(
      response.headers.get("location"),
      `${options.origin}/integrations?github=failed`,
    );
    assert.ok(
      response.headers
        .getSetCookie()
        .every((cookie) => cookie.includes("Max-Age=0")),
    );
  }
  assert.match(
    (await github.callback(request(path, flowCookie), "")).headers.get(
      "location",
    )!,
    /github=failed$/,
  );
  const currentTime = Date.now();
  const clock = t.mock.method(Date, "now", () => currentTime + 601_000);
  assert.match(
    (await github.callback(request(path, flowCookie), actor)).headers.get(
      "location",
    )!,
    /github=failed$/,
  );
  clock.mock.restore();
  assert.equal(exchanges, 0);
});
