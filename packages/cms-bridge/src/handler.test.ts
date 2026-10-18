import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createCMSBridgeHandler } from "./server.ts";
test("opt-in handler reads live configuration and passes only subject-projected authority", async () => {
  const directory = await mkdtemp(`${tmpdir()}/cms-handler-`);
  try {
    let enabled = false,
      lookups = 0,
      handled = 0;
    const config = {
      secret: "s".repeat(32),
      instance: "binding",
      project: "project",
      origin: "https://site.invalid",
      transferDirectory: directory,
    };
    const handler = createCMSBridgeHandler({
      getConfig: () => (enabled ? config : null),
      getPayload: async () =>
        ({
          find: async () => {
            lookups++;
            return {
              docs: [
                {
                  id: 1,
                  authSubject: "actor",
                  role: "reader",
                  disabled: false,
                },
              ],
            };
          },
        }) as never,
      handleCMS: async (request, user) => {
        handled++;
        assert.equal(user.role, "reader");
        assert.equal(request.headers.get("cookie"), null);
        return Response.json({ role: user.role });
      },
    });
    const descriptor = Buffer.from(
      JSON.stringify({ method: "GET", path: "/api/cms" }),
    ).toString("base64url");
    const url = `https://site.invalid/api/webdock/cms?request=${descriptor}`;
    assert.equal((await handler(new Request(url))).status, 503);
    enabled = true;
    assert.equal((await handler(new Request(url))).status, 401);
    assert.equal(lookups, 0);
    const response = await handler(
      new Request(url, {
        headers: {
          authorization: `Bearer ${config.secret}`,
          "x-webdock-instance": "binding",
          "x-webdock-project": "project",
          "x-webdock-subject": "actor",
          "x-webdock-role": "admin",
          "x-webdock-grant-epoch": "1",
          cookie: "forged",
        },
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(handled, 1);
    assert.equal(lookups, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
