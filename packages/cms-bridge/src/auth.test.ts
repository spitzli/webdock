import test from "node:test";
import assert from "node:assert/strict";
import { authenticateBridge, projectBridgeUser } from "./auth.ts";
const config = {
  secret: "s".repeat(32),
  instance: "site-one",
  project: "project-one",
};
const good = () =>
  new Headers({
    authorization: `Bearer ${config.secret}`,
    "x-webdock-instance": config.instance,
    "x-webdock-project": config.project,
    "x-webdock-subject": "immutable-subject",
    "x-webdock-role": "editor",
    "x-webdock-grant-epoch": "epoch-1",
  });
test("bridge rejects missing credentials, wrong audience/project and browser actor injection", () => {
  assert.throws(() => authenticateBridge(new Headers(), config));
  for (const key of [
    "authorization",
    "x-webdock-instance",
    "x-webdock-project",
    "x-webdock-role",
    "x-webdock-grant-epoch",
  ]) {
    const h = good();
    h.set(key, key === "x-webdock-grant-epoch" ? "" : "bad");
    assert.throws(() => authenticateBridge(h, config));
  }
  assert.deepEqual(authenticateBridge(good(), config), {
    instance: config.instance,
    project: config.project,
    subject: "immutable-subject",
    role: "editor",
    grantEpoch: "epoch-1",
  });
});
test("projection uses immutable subject only, preserves disabled users and intersects local ceiling", async () => {
  const scope = authenticateBridge(good(), config);
  let user: any = null;
  let created = 0;
  const payload: any = {
    find: async (args: any) => {
      assert.deepEqual(args.where, { authSubject: { equals: scope.subject } });
      return { docs: user ? [user] : [] };
    },
    create: async (args: any) => {
      created++;
      user = { id: 1, ...args.data };
      return user;
    },
  };
  assert.equal((await projectBridgeUser(payload, scope)).role, "editor");
  assert.equal(created, 1);
  user.role = "reader";
  assert.equal((await projectBridgeUser(payload, scope)).role, "reader");
  assert.equal(created, 1);
  user.disabled = true;
  await assert.rejects(projectBridgeUser(payload, scope));
  assert.equal(created, 1);
});
