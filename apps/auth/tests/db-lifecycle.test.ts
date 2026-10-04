import assert from "node:assert/strict";
import test from "node:test";
import { database } from "../src/lib/db";

test("Vercel keeps the function alive until released database connections close", async () => {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.equal(url.pathname, "/webdock_admin_test");
  const symbol = Symbol.for("@vercel/request-context");
  const globals = globalThis as typeof globalThis & { [symbol: symbol]: unknown };
  const previous = globals[symbol];
  const previousURL = process.env.VERCEL_URL;
  const previousRegion = process.env.VERCEL_REGION;
  const pending: Promise<unknown>[] = [];
  globals[symbol] = { get: () => ({ waitUntil: (promise: Promise<unknown>) => pending.push(promise) }) };
  process.env.VERCEL_URL = "auth.example.test";
  process.env.VERCEL_REGION = "fra1";
  try {
    await database.query("SELECT 1");
    assert.ok(pending.length > 0, "released connections must hold the function open");
    await Promise.all(pending);
    assert.equal(database.totalCount, 0, "idle sockets must close before suspension");
  } finally {
    globals[symbol] = previous;
    if (previousURL === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = previousURL;
    if (previousRegion === undefined) delete process.env.VERCEL_REGION;
    else process.env.VERCEL_REGION = previousRegion;
    await database.end();
  }
});
