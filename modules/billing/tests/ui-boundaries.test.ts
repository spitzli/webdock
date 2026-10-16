import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { billingFormKey } from "../src/ui/state";
test("Billing UI consumes public contracts/actions without app imports, cookies or provider secrets", async () => {
  const directory = new URL("../src/ui/", import.meta.url);
  for (const file of await readdir(directory)) {
    const source = await readFile(new URL(file, directory), "utf8");
    assert.doesNotMatch(
      source,
      /(?:from\s*|import\s*\()["'](?:@\/|[^"']*apps\/|@webdock\/api-client)/,
      file,
    );
    assert.doesNotMatch(
      source,
      /process\.env|next\/headers|["']use server["']/,
      file,
    );
  }
  const tenant = await readFile(
    new URL(
      "../../../apps/console/src/app/(console)/(portal)/tenants/[customerID]/billing/form.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(tenant, /key=\{billingFormKey/);
  assert.match(tenant, /props\.values\.customerID/);
  assert.match(tenant, /props\.values\.environment/);
  assert.match(tenant, /props\.values\.termsHash/);
  for (const file of ["admin-forms", "catalog-forms"]) {
    const source = await readFile(
      new URL("../src/ui/" + file + ".tsx", import.meta.url),
      "utf8",
    );
    assert.match(source, /key=\{selectedCustomer\}/);
  }
});
test("action state keys cannot collide across tenant, environment, revision or ambiguous delimiters", () => {
  const key = billingFormKey("tenant-a", "live", "resource", 1);
  assert.notEqual(key, billingFormKey("tenant-b", "live", "resource", 1));
  assert.notEqual(key, billingFormKey("tenant-a", "sandbox", "resource", 1));
  assert.notEqual(key, billingFormKey("tenant-a", "live", "resource", 2));
  assert.notEqual(billingFormKey("a:b", "c"), billingFormKey("a", "b:c"));
});
