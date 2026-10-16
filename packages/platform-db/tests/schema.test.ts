import { test } from "node:test";
import assert from "node:assert/strict";
import { getTableConfig } from "drizzle-orm/pg-core";
import { user, session } from "../src/schema/auth";
import { billingProduct, billingCheckout } from "../src/schema/billing";
import { customers, projects } from "../src/schema/registry";
test("canonical mappings retain physical schemas, table identities and decimal ID columns", () => {
  for (const [table, schema, name] of [
    [user, "webdock_auth", "user"],
    [session, "webdock_auth", "session"],
    [billingProduct, "webdock_auth", "billing_product"],
    [billingCheckout, "webdock_auth", "billing_checkout"],
    [customers, "webdock_admin", "customers"],
    [projects, "webdock_admin", "projects"],
  ] as const) {
    const config = getTableConfig(table);
    assert.equal(config.schema, schema);
    assert.equal(config.name, name);
    const id = config.columns.find((column) => column.name === "id");
    assert.ok(id);
    assert.equal(id.dataType, "string");
  }
});
