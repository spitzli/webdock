import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
test("Billing owns business logic without application, runtime provider or ambient environment imports", async () => {
  const directory = new URL("../src/server/", import.meta.url);
  for (const name of await readdir(directory)) {
    const source = await readFile(new URL(name, directory), "utf8");
    assert.doesNotMatch(
      source,
      /process\.env|from ["'](?:@\/|[^"']*apps\/|[^"']*adapters\/)/,
      name,
    );
    assert.doesNotMatch(
      source,
      /^import\s+(?!type\b).*from ["']@polar-sh/m,
      name,
    );
  }
  const checkout = await readFile(
    new URL("../src/server/checkout.ts", import.meta.url),
    "utf8",
  );
  assert.match(checkout, /requireBilling\("provision"\)/);
  const subscription = await readFile(
    new URL("../src/server/subscriptions.ts", import.meta.url),
    "utf8",
  );
  assert.match(subscription, /q\.direction === "upgrade"/);
  assert.match(subscription, /requireBilling\("provision"\)/);
});

test("direct API catalog and offer composition supply installation admission", async () => {
  for (const file of ["catalog", "offers"]) {
    const source = await readFile(
      new URL(
        `../../../apps/control-plane/src/modules/billing/${file}.ts`,
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(source, /requireOperation:\s*requireInstalledOperation/);
  }
});
