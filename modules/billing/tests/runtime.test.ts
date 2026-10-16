import { test } from "node:test";
import assert from "node:assert/strict";
import { createBillingContext } from "../src/server/context";
import { createBillingCrypto } from "../src/server/crypto";
import { createBillingJobs, type BillingJob } from "../src/server/jobs";
import { createBillingWorkerProvider } from "../src/server/worker-provider";
import { BillingReviewError } from "../src/server/reconcile-policy";
import { currentDatabaseScope } from "@webdock/database-runtime";
import type { PlatformDatabaseRuntime } from "@webdock/platform-db/types";
const actor = { subject: "123", sessionID: "session-local" };
test("operator transaction rechecks authorization after work and preserves local signed scope", async () => {
  let allowed = true,
    checks = 0,
    ran = false;
  const orm = {
    transaction: async (run: (tx: unknown) => Promise<unknown>) =>
      run({
        execute: async () => {
          checks++;
          assert.deepEqual(currentDatabaseScope(), {
            kind: "session",
            ...actor,
          });
          return { rows: [{ allowed }] };
        },
      }),
  } as unknown as PlatformDatabaseRuntime["orm"];
  const context = createBillingContext({ databasePools: { orm } });
  await assert.rejects(
    context.operatorTransaction(actor, async () => {
      ran = true;
      allowed = false;
      return "not-committed";
    }),
    /Current operator access/,
  );
  assert.equal(ran, true);
  assert.equal(checks, 2);
  assert.equal(currentDatabaseScope(), undefined);
  await assert.rejects(
    context.operatorTransaction(actor, async () => {
      throw Error("should-not-run");
    }),
    /Current operator access/,
  );
});
test("module encryption root is explicit and read when used; envelopes retain environment/version binding", () => {
  let root = "fixture-billing-root-key-at-least-32-characters";
  const crypto = createBillingCrypto({ encryptionRoot: () => root });
  const encrypted = crypto.sealBilling(
    { secret: "private-fixture" },
    "sandbox",
    "token",
    1,
  );
  assert.deepEqual(crypto.openBilling(encrypted, "sandbox", "token", 1), {
    secret: "private-fixture",
  });
  assert.throws(() => crypto.openBilling(encrypted, "live", "token", 1));
  root = "changed-fixture-billing-root-key-at-least-32";
  assert.throws(() => crypto.openBilling(encrypted, "sandbox", "token", 1));
});
test("worker credential absence never instantiates a provider", async () => {
  let calls = 0;
  const worker = {
    query: async () => ({ rows: [{ value: null }] }),
  } as unknown as PlatformDatabaseRuntime["worker"];
  const provider = createBillingWorkerProvider({
    databasePools: { worker },
    openBilling: () => {
      throw Error("unexpected decrypt");
    },
    billingPolar: () => {
      calls++;
      throw Error("unexpected provider");
    },
  });
  await assert.rejects(
    provider.billingWorkerProvider("live"),
    /provider is unavailable/,
  );
  assert.equal(calls, 0);
});
test("job failure keeps lease-token fences, redacted codes and explicit review state", async () => {
  const calls: { sql: string; args: unknown[] }[] = [];
  const worker = {
    query: async (sql: string, args: unknown[]) => {
      assert.deepEqual(currentDatabaseScope(), {
        kind: "system",
        purpose: "polar:sandbox:dispatcher",
      });
      calls.push({ sql, args });
      return { rows: [], rowCount: 0 };
    },
  } as unknown as PlatformDatabaseRuntime["worker"];
  const jobs = createBillingJobs({ databasePools: { worker } }),
    job: BillingJob = {
      id: "123",
      kind: "reconcile",
      customerID: "456",
      eventID: null,
      claimToken: "lease-token",
      attempts: 2,
    };
  await jobs.failBillingJob(
    "sandbox",
    job,
    new BillingReviewError("payment_mismatch"),
  );
  assert.match(calls[0].sql, /needs_review/);
  assert.match(calls[0].sql, /claim_token=\$3/);
  assert.match(calls[0].sql, /lease_until>now/);
  assert.deepEqual(calls[0].args, [
    "sandbox",
    "123",
    "lease-token",
    "payment_mismatch",
  ]);
  await jobs.failBillingJob(
    "sandbox",
    job,
    new Error("private-provider-response"),
  );
  assert.equal(calls[1].args[4], "provider_unavailable");
  assert.equal(
    JSON.stringify(calls).includes("private-provider-response"),
    false,
  );
  assert.equal(await jobs.completeBillingJob("sandbox", job), false);
});
