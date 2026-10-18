import test from "node:test";
import assert from "node:assert/strict";
import { createBridgeTransport } from "./client.ts";
test("reader transport uses GET descriptors only and validates downloaded response integrity", async () => {
  const serialized = new TextEncoder().encode(
    JSON.stringify({
      status: 200,
      contentType: "application/json",
      bodyBase64: btoa('{"ok":true}'),
    }),
  );
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", serialized)),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
  let calls = 0;
  const transport = createBridgeTransport(async (args) => {
    calls++;
    assert.equal(args.method, "GET");
    if (args.path.includes("?request="))
      return {
        status: 200,
        body: { transfer: "id", size: serialized.length, sha256: digest },
      };
    return {
      status: 200,
      body: {
        data: Buffer.from(serialized).toString("base64"),
        offset: serialized.length,
        done: true,
      },
    };
  });
  assert.deepEqual(await (await transport("/api/cms?module=pages")).json(), {
    ok: true,
  });
  assert.equal(calls, 2);
  await assert.rejects(transport("https://evil.invalid/api/cms"));
});
for (const scenario of [
  "lost-commit-response",
  "executing-receipt",
  "lost-result-download",
  "append-failure",
  "validation-response",
] as const)
  test(`mutation transport handles ${scenario} without blind retry`, async () => {
    const serialized = Buffer.from(
      JSON.stringify({
        status: 400,
        contentType: "application/json",
        bodyBase64: Buffer.from('{"error":"Invalid field."}').toString(
          "base64",
        ),
      }),
    );
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", serialized)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    let commits = 0;
    const transport = createBridgeTransport(async (request) => {
      if (request.method === "GET") {
        if (scenario === "lost-result-download") throw Error("connection lost");
        return {
          status: 200,
          body: {
            data: serialized.toString("base64"),
            offset: serialized.length,
            done: true,
          },
        };
      }
      if (request.body?.op === "begin")
        return { status: 200, body: { transfer: "id" } };
      if (request.body?.op === "append") {
        if (scenario === "append-failure") throw Error("append interrupted");
        return {
          status: 200,
          body: {
            offset:
              request.body.offset +
              Buffer.from(request.body.data, "base64").length,
          },
        };
      }
      commits++;
      if (scenario === "lost-commit-response") throw Error("connection lost");
      if (scenario === "executing-receipt")
        return { status: 409, body: { error: "reconciliation_required" } };
      return {
        status: 200,
        body: { transfer: "id", size: serialized.length, sha256: digest },
      };
    });
    const mutation = () =>
      transport("/api/cms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"module":"pages"}',
      });
    if (scenario === "validation-response") {
      const response = await mutation();
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "Invalid field." });
    } else if (scenario === "append-failure")
      await assert.rejects(mutation(), (error) =>
        Boolean(error instanceof Error && !("code" in error)),
      );
    else
      await assert.rejects(mutation(), (error) =>
        Boolean(
          error instanceof Error &&
          "code" in error &&
          error.code === "cms_save_uncertain" &&
          error.message ===
            "This save may have completed. Check the content list before trying again.",
        ),
      );
    assert.equal(commits, scenario === "append-failure" ? 0 : 1);
  });
