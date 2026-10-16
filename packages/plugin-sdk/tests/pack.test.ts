import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
test("packed contracts load outside the monorepo", () => {
  const dir = mkdtempSync(join(tmpdir(), "webdock-plugin-pack-"));
  try {
    const root = resolve(import.meta.dirname, "../../..");
    const packed = JSON.parse(
      execFileSync(
        "npm",
        [
          "pack",
          "--workspace",
          "@webdock/plugin-sdk",
          "--pack-destination",
          dir,
          "--json",
        ],
        { cwd: root, encoding: "utf8" },
      ),
    );
    assert.equal(packed.length, 1);
    assert.ok(
      packed[0].files.some(
        (f: { path: string }) => f.path === "dist/contracts/index.d.ts",
      ),
    );
    assert.ok(
      packed[0].files.every(
        (f: { path: string }) => !f.path.startsWith("src/"),
      ),
    );
    writeFileSync(
      join(dir, "package.json"),
      '{"private":true,"type":"module"}',
    );
    // Install only from the local cache: this smoke test cannot publish or run dependency scripts.
    execFileSync(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--offline",
        "--no-audit",
        "--no-fund",
        join(dir, packed[0].filename),
      ],
      { cwd: dir, stdio: "pipe" },
    );
    const result = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "import {parsePluginManifest} from '@webdock/plugin-sdk/contracts'; try {parsePluginManifest({})} catch(e) {if(e.code==='invalid_input') process.exit(0)} process.exit(1)",
      ],
      { cwd: dir },
    );
    assert.equal(result.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
