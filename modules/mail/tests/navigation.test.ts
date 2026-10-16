import { test } from "node:test";
import assert from "node:assert/strict";
import { mailNavigation } from "../src/navigation.ts";
test("navigation preserves customer and integration context and limits management links", () => {
  const member = mailNavigation(
    "123",
    false,
    "/tenants/123/mail/sending",
    "456",
  );
  assert.ok(
    member.every(
      (link) =>
        link.href.startsWith("/tenants/123/mail") &&
        link.href.endsWith("?connection=456"),
    ),
  );
  assert.ok(
    !member.some(
      (link) => link.label === "API keys" || link.label === "Settings",
    ),
  );
  const admin = mailNavigation("789", true, "/tenants/789/mail/sending", "987");
  assert.ok(admin.some((link) => link.label === "API keys"));
  assert.ok(
    admin.every(
      (link) => !link.href.includes("123") && !link.href.includes("456"),
    ),
  );
  assert.ok(
    !mailNavigation("123", true, "/tenants/123/mail", null).some(
      (link) => link.nested,
    ),
  );
});
