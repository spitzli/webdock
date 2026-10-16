import { test } from "node:test";

import assert from "node:assert/strict";

import { readdir, readFile } from "node:fs/promises";

import { hostingUIScope } from "../src/ui/scope";

test("Hosting UI resource keys isolate customer/project/database state without encoding secrets or request revisions", () => {
  const scope = {
    command: {
      action: "apps.update",
      customerID: "123",
      projectID: "456",
      appID: "789",
      idempotencyKey: "private-one",
      revision: 1,
      password: "secret",
    },
  };
  assert.equal(
    hostingUIScope(scope),
    hostingUIScope({
      command: {
        ...scope.command,
        revision: 2,
        password: "other",
        idempotencyKey: "new",
      },
    }),
  );
  assert.notEqual(
    hostingUIScope(scope),
    hostingUIScope({ command: { ...scope.command, customerID: "other" } }),
  );
  assert.notEqual(
    hostingUIScope({
      options: { project: { projectID: "123", customerID: "456" } },
    }),
    hostingUIScope({
      options: { project: { projectID: "999", customerID: "456" } },
    }),
  );
  assert.ok(!hostingUIScope(scope).includes("private-one"));
  assert.ok(!hostingUIScope(scope).includes("secret"));
});

test("Hosting module UI and console-kit depend on public UI ports, never application or server runtime imports", async () => {
  for (const directory of [
    new URL("../src/ui/", import.meta.url),
    new URL("../../../packages/console-kit/src/", import.meta.url),
  ])
    for (const file of await readdir(directory)) {
      if (!/\.tsx?$/.test(file)) continue;
      const source = await readFile(new URL(file, directory), "utf8");
      assert.doesNotMatch(
        source,
        /(?:from\s+|import\s*\()["'][^"']*(?:@\/|apps\/|\/server\/|db\/runtime)/,
      );
      assert.doesNotMatch(source, /^["']use server["'];/m);
      assert.doesNotMatch(source, /process\.env/);
    }
});
