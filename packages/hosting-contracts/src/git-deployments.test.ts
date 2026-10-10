import test from "node:test";
import assert from "node:assert/strict";
import { gitCommandSchema } from "./git-deployments";
const source = {
  action: "git.source.configure",
  projectID: "123",
  connectionID: "456",
  repositoryID: "789",
  branch: "main",
  rootDirectory: ".",
  recipe: "dockerfile",
  targetID: "321",
  revision: 0,
};
test("Git sources accept exact bounded identifiers and safe relative paths", () => {
  assert.equal(gitCommandSchema.parse(source).action, source.action);
  for (const rootDirectory of ["../a", "/tmp", "a/../b", "a\\b", "a//b"])
    assert.equal(
      gitCommandSchema.safeParse({ ...source, rootDirectory }).success,
      false,
    );
  for (const projectID of ["0", "1;DROP", "9223372036854775808"])
    assert.equal(
      gitCommandSchema.safeParse({ ...source, projectID }).success,
      false,
    );
  assert.equal(
    gitCommandSchema.safeParse({ ...source, branch: "main\n" }).success,
    false,
  );
  assert.equal(
    gitCommandSchema.safeParse({ ...source, secret: "oops" }).success,
    false,
  );
});
test("list pagination and mutation concurrency are bounded", () => {
  assert.equal(
    gitCommandSchema.safeParse({
      action: "git.builds.list",
      projectID: "123",
      limit: 101,
    }).success,
    false,
  );
  assert.equal(
    gitCommandSchema.safeParse({
      action: "git.releases.approve",
      projectID: "123",
      releaseID: "456",
    }).success,
    false,
  );
});
