import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const cli = new URL("../src/cli.js", import.meta.url);
test("scaffold refuses overwrite; validation and pack produce identical descriptors", async () => {
  const parent = await mkdtemp(join(tmpdir(), "webdock-cli-"));
  const dir = join(parent, "demo");
  const run = (...args) =>
    spawnSync(
      process.execPath,
      [cli.pathname, "plugin", ...args, "--dir", dir, "--json"],
      { encoding: "utf8" },
    );
  try {
    assert.equal(run("create", "job-demo").status, 0);
    assert.notEqual(run("create", "job-demo").status, 0);
    assert.equal(run("validate").status, 0);
    assert.notEqual(run("pack").status, 0);
    assert.equal(
      run("pack", "--image", "ghcr.io/spitzli/demo@sha256:" + "a".repeat(64))
        .status,
      0,
    );
    assert.equal(
      await readFile(join(dir, "dist/tabularium.json"), "utf8"),
      await readFile(join(dir, "dist/job-demo-universal.json"), "utf8"),
    );
    assert.equal(
      JSON.parse(await readFile(join(dir, "package.json"), "utf8"))
        .dependencies["@webdock/plugin-sdk"],
      "0.1.0",
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
