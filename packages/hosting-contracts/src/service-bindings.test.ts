import test from "node:test";
import assert from "node:assert/strict";
import { serviceCommandSchema } from "./service-bindings";
test("service binding commands validate identities, revisions and managed variable names", () => {
  const cmd = {
    action: "services.bind",
    projectID: "11",
    appID: "12",
    revision: 0,
    idempotencyKey: "bind-database-once",
    service: { kind: "postgres", databaseID: "13", variable: "DATABASE_URL" },
  };
  assert.equal(serviceCommandSchema.safeParse(cmd).success, true);
  for (const variable of ["__proto__", "INVALID-NAME", ""])
    assert.equal(
      serviceCommandSchema.safeParse({
        ...cmd,
        service: { ...cmd.service, variable },
      }).success,
      false,
    );
  assert.equal(
    serviceCommandSchema.safeParse({
      ...cmd,
      service: { ...cmd.service, host: "evil" },
    }).success,
    false,
  );
  assert.equal(
    serviceCommandSchema.safeParse({ ...cmd, revision: -1 }).success,
    false,
  );
  assert.equal(
    serviceCommandSchema.safeParse({
      action: "services.list",
      projectID: "11",
      appID: "12",
    }).success,
    true,
  );
});
