import { getTableName } from "drizzle-orm";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createRegistryService } from "./service.ts";
import {
  beforeArchiveCmsProject,
  createCmsRegistryExtension,
} from "../../../../modules/cms/src/server/registry.ts";
import { createRegistryStore } from "./store.ts";
import { nextRegistryID } from "./snowflake.ts";
import { recordID } from "./contracts.ts";
import type { RegistryDependencies, RegistryPool } from "./ports.ts";
const actor = { subject: "123", sessionID: "session-123" };
function fixture(allowed: boolean[] = [true, true], cms = true) {
  const scopes: unknown[] = [],
    locks: string[] = [],
    products: unknown[] = [],
    tables: string[] = [];
  let selects = 0;
  const row = {
    id: "456",
    name: "Operator",
    email: "operator@example.invalid",
    role: "operator",
    authSubject: "123",
  };
  const builder = {
    from: (table: Parameters<typeof getTableName>[0]) => {
      tables.push(getTableName(table));
      return builder;
    },
    where: () => builder,
    limit: () => builder,
    orderBy: () => builder,
    offset: () => builder,
    for: async (mode: string) => {
      locks.push(mode);
      return [row];
    },
    then: (resolve: (rows: (typeof row)[]) => unknown) => resolve([row]),
  };
  const transaction = {
    execute: async (statement: unknown) => {
      const text = JSON.stringify(statement);
      if (text.includes("to_regclass")) return { rows: [{ present: true }] };
      return { rows: [{ allowed: allowed.shift() ?? false }] };
    },
    select: () => {
      selects++;
      return builder;
    },
  };
  const database = {
    transaction: async (run: (value: typeof transaction) => Promise<unknown>) =>
      run(transaction),
  } as unknown as RegistryDependencies["database"];
  const pool = {} as RegistryPool;
  const service = createRegistryService({
    database,
    pool,
    withSessionScope: async (identity, run) => {
      scopes.push(identity);
      return run();
    },
    beforeArchive: cms ? beforeArchiveCmsProject : undefined,
    collections: cms
      ? {
          "cms-instances": createCmsRegistryExtension((product, intent) => {
            products.push([product, intent]);
            throw Error("CMS disabled");
          }),
        }
      : undefined,
    close: async () => {},
  });
  return {
    service,
    pool,
    scopes,
    locks,
    products,
    tables,
    selects: () => selects,
  };
}
test("core registry operator reads preserve session scope, mapped-row lock and post-read revocation independently from CMS", async () => {
  const f = fixture();
  const user = await f.service.operator(actor);
  assert.equal(user.id, "456");
  assert.equal(user.authSubject, "123");
  assert.deepEqual(f.scopes, [actor]);
  assert.deepEqual(f.locks, ["share"]);
  assert.deepEqual(f.products, []);
  const revoked = fixture([true, false]);
  await assert.rejects(revoked.service.operator(actor), /revoked/);
  assert.deepEqual(revoked.locks, ["share"]);
  const denied = fixture([false]);
  await assert.rejects(
    denied.service.operator(actor),
    /Current operator access/,
  );
  assert.equal(denied.selects(), 0);
});
test("CMS writes require injected product authority before transactions and distinguish create from existing management", async () => {
  const f = fixture();
  await assert.rejects(
    f.service.writeCollection(actor, "cms-instances", null, {}, true),
    /CMS disabled/,
  );
  await assert.rejects(
    f.service.writeCollection(actor, "cms-instances", "789", {}, true),
    /CMS disabled/,
  );
  assert.deepEqual(f.products, [
    ["cms", "provision"],
    ["cms", "access"],
  ]);
  assert.deepEqual(f.scopes, []);
});
test("core starts without CMS and fails closed on legacy CMS access", async () => {
  const f = fixture([true, true, true, true], false);
  assert.equal((await f.service.operator(actor)).id, "456");
  await assert.rejects(
    f.service.writeCollection(actor, "cms-instances", null, {}, true),
    /collection unavailable/,
  );
  await assert.rejects(
    f.service.query(actor, "find", { collection: "cms-instances" }),
    /Invalid registry operation/,
  );
});
test("retained CMS instances block project archive even when CMS authority is disabled", async () => {
  const f = fixture();
  await assert.rejects(
    f.service.archive(actor, "projects", "789", true),
    /Retire the linked CMS/,
  );
  assert.deepEqual(f.products, []);
  assert.deepEqual(f.locks, ["share", "update"]);
});
test("registry compatibility facade discards caller-supplied identity and overrideAccess", async () => {
  const calls: unknown[] = [];
  const service = {
    raw: {} as RegistryPool,
    query: async (
      identity: unknown,
      mode: string,
      query: Record<string, unknown>,
    ) => {
      calls.push({ identity, mode, query });
      return {
        docs: [],
        page: 1,
        totalPages: 1,
        totalDocs: 0,
        hasNextPage: false,
      };
    },
  };
  const store = createRegistryStore(service, actor);
  await store.find({
    collection: "customers",
    user: { role: "operator" },
    overrideAccess: true,
    limit: 5,
  });
  assert.deepEqual(calls, [
    {
      identity: actor,
      mode: "find",
      query: { collection: "customers", limit: 5 },
    },
  ]);
  assert.equal(store.db.pool, service.raw);
});
test("registry IDs stay decimal strings above JavaScript integer precision", async () => {
  const id = "9223372036854775807";
  assert.equal(recordID.parse(id), id);
  assert.throws(() => recordID.parse("9223372036854775808"));
  assert.throws(() => recordID.parse(Number(id)));
  const pool = {
    query: async () => ({ rows: [{ id }] }),
  } as unknown as RegistryPool;
  assert.equal(await nextRegistryID(pool), id);
});
test("core registry contains no application/product/provider imports and DTO exports cannot reach database clients", async () => {
  for (const file of await readdir(new URL("./", import.meta.url))) {
    if (file.endsWith(".test.ts")) continue;
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /(?:from\s+|import\s*\()["'][^"']*(?:apps\/|@webdock\/module-|@webdock\/adapter-|@webdock\/api-client)/,
    );
    assert.doesNotMatch(source, /process\.env/);
  }
  for (const file of ["types.ts", "contracts.ts", "errors.ts"]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /drizzle|node-postgres|from ["']pg|from ["']\.\/service/,
    );
  }
});

test("core-only customer, project and audit reads need no CMS collection", async () => {
  for (const collection of ["customers", "projects", "audit-events"]) {
    for (const read of [
      (service: ReturnType<typeof createRegistryService>) =>
        service.getRecord(actor, collection, "456"),
      (service: ReturnType<typeof createRegistryService>) =>
        service.listRecords(actor, { collection }),
      (service: ReturnType<typeof createRegistryService>) =>
        service.query(actor, "find", { collection }),
    ]) {
      const f = fixture([true, true], false);
      await read(f.service);
      assert.ok(f.tables.includes(collection.replaceAll("-", "_")));
      assert.ok(!f.tables.includes("cms_instances"));
      assert.deepEqual(f.products, []);
      assert.deepEqual(f.scopes, [actor]);
    }
  }
});
test("generic list/get endpoints cannot expose native user secrets", async () => {
  const f = fixture([true, true], false);
  await assert.rejects(
    f.service.listRecords(actor, { collection: "users" }),
    /Invalid collection/,
  );
  await assert.rejects(
    f.service.getRecord(actor, "users", "456"),
    /Invalid collection/,
  );
  assert.deepEqual(f.scopes, []);
});
