import assert from "node:assert/strict";
import test from "node:test";
import { guardNativeCMSMutation } from "../src/lib/cms-bridge-policy.ts";

test("opted-in websites reject REST content writes but retain user auth and non-opted-in behavior", async () => {
  let calls = 0;
  const handler = guardNativeCMSMutation(
    async (
      _request: Request,
      _context: { params: Promise<{ slug: string[] }> },
    ) => {
      calls++;
      return Response.json({ native: true });
    },
  );
  const enabled = {
    CMS_BRIDGE_SECRET: "fixture",
    CMS_INSTANCE_ID: "binding-1",
    CMS_PROJECT_ID: "project-1",
  };
  const original = Object.fromEntries(
    Object.keys(enabled).map((key) => [key, process.env[key]]),
  );
  try {
    Object.assign(process.env, enabled);
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      const request = new Request(
        "https://site.test/api/globals/landing-page",
        { method },
      );
      const response = await handler(request, {
        params: Promise.resolve({ slug: ["globals", "landing-page"] }),
      });
      assert.equal(response.status, 403);
    }
    // The route params, not encoded URL spelling, decide the collection boundary.
    assert.equal(
      (
        await handler(
          new Request("https://site.test/api/users/../globals/landing-page", {
            method: "POST",
          }),
          { params: Promise.resolve({ slug: ["globals", "landing-page"] }) },
        )
      ).status,
      403,
    );
    assert.equal(calls, 0);
    assert.equal(
      (
        await handler(
          new Request("https://site.test/api/users/login", { method: "POST" }),
          { params: Promise.resolve({ slug: ["users", "login"] }) },
        )
      ).status,
      200,
    );
    delete process.env.CMS_PROJECT_ID;
    assert.equal(
      (
        await handler(
          new Request("https://site.test/api/globals/landing-page", {
            method: "POST",
          }),
          { params: Promise.resolve({ slug: ["globals", "landing-page"] }) },
        )
      ).status,
      200,
    );
    assert.equal(calls, 2);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
