import test from "node:test";
import assert from "node:assert/strict";
import { databaseCommand, runtimeOrigin, publicBinding } from "./index";

test("runtime addresses are origins, never credential-bearing URLs or arbitrary paths", () => {
  for (const value of ["https://user:secret@db.example", "https://db.example/path", "https://db.example/?token=x", "file:///etc/passwd", "https://db.example/#x"]) {
    assert.equal(runtimeOrigin.safeParse(value).success, false);
  }
  assert.equal(runtimeOrigin.parse("https://db.example"), "https://db.example");
});

test("database commands reject forged tenant and unknown fields", () => {
  assert.equal(databaseCommand.safeParse({ action: "open", bindingID: "10", customerID: "20" }).success, false);
  assert.equal(databaseCommand.safeParse({ action: "grant", bindingID: "10", profile: "owner" }).success, false);
});

test("public binding DTOs cannot expose runtime addresses or secrets", () => {
  const result = publicBinding.parse({ id: "10", projectID: "20", customerID: "30", name: "Orders", environment: "production", profile: "read", engine: "postgresql", runtimeOrigin: "https://private", proxySecret: "secret" });
  assert.equal("runtimeOrigin" in result, false);
  assert.equal("proxySecret" in result, false);
});
