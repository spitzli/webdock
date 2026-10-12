import test from "node:test";
import assert from "node:assert/strict";
import { commandSchema, databaseViewSchema, databasePlanSchema } from "./index";
const key = "database-test-key-123";
test("database create requires accepted order and rejects CNPG specs and secret injection", () => {
  const create = {
    action: "databases.create",
    projectID: "123",
    name: "Application",
    planRevisionID: "456",
    orderID: "789",
    kind: "shared",
    idempotencyKey: key,
  };
  assert.equal(commandSchema.parse(create).action, "databases.create");
  for (const change of [
    { orderID: undefined },
    { projectID: 123 },
    { kind: "free" },
    { cnpg: { image: "evil" } },
    { password: "secret" },
    { orderID: "9223372036854775808" },
  ])
    assert.equal(
      commandSchema.safeParse({ ...create, ...change }).success,
      false,
    );
});
test("shared database plans do not promise dedicated resources or backup recovery", () => {
  const plan = {
    kind: "shared",
    name: "Shared",
    monthlyPriceCents: 590,
    currency: "EUR",
    postgresMajor: 18,
    cpuMillicores: null,
    memoryBytes: null,
    volumeBytes: null,
    logicalStorageAllowanceBytes: 1073741824,
    connectionLimit: 10,
    terms: "Shared CPU/RAM, measured storage. Backups are not configured.",
  };
  assert.ok(databasePlanSchema.safeParse(plan).success);
  assert.equal(
    databasePlanSchema.safeParse({ ...plan, memoryBytes: 1073741824 }).success,
    false,
  );
  assert.equal(
    databasePlanSchema.safeParse({ ...plan, monthlyPriceCents: 0 }).success,
    false,
  );
  assert.equal(
    databasePlanSchema.safeParse({ ...plan, backupRetentionDays: 7 }).success,
    false,
  );
});
test("copy needs authorized target order; operator mutations are revision fenced", () => {
  const copy = {
    action: "databases.restore",
    sourceDatabaseID: "1",
    targetProjectID: "2",
    name: "Restored",
    restorePointID: "3",
    targetOrderID: "4",
    revision: 1,
    idempotencyKey: key,
  };
  assert.ok(commandSchema.safeParse(copy).success);
  assert.equal(
    commandSchema.safeParse({ ...copy, targetOrderID: undefined }).success,
    false,
  );
  assert.equal(
    commandSchema.safeParse({
      action: "databases.pause",
      databaseID: "1",
      idempotencyKey: key,
    }).success,
    false,
  );
});
test("database view cannot carry plaintext or claim shared filesystem enforcement", () => {
  const view = {
    id: "1",
    projectID: "2",
    name: "DB",
    revision: 1,
    observedRevision: 0,
    state: "provisioning",
    planRevisionID: "3",
    kind: "shared",
    postgresMajor: 18,
    cpuMillicores: null,
    memoryBytes: null,
    volumeBytes: null,
    logicalStorageAllowanceBytes: 1073741824,
    storageEnforcement: "measured-logical",
    databaseName: "db_1",
    endpoint: null,
    backup: {
      status: "not-configured",
      lastSuccessAt: null,
      recoverableUntil: null,
      lastRestoreTestAt: null,
    },
    operationID: "4",
    observedAt: null,
    usage: null,
    cancellationRequestedAt: null,
  };
  assert.ok(databaseViewSchema.safeParse(view).success);
  assert.equal(
    databaseViewSchema.safeParse({ ...view, password: "secret" }).success,
    false,
  );
  assert.equal(
    databaseViewSchema.safeParse({
      ...view,
      storageEnforcement: "bounded-filesystem",
    }).success,
    false,
  );
});
