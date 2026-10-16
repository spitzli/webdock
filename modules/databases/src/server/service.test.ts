import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDatabaseService,
  type DatabaseServiceDependencies,
} from "./service";
import type { DatabaseReader } from "@webdock/core/identity";
import type { HostingActor } from "@webdock/hosting-contracts";
const actor: HostingActor = {
  subject: "local-user",
  sessionID: "local-session",
  source: "studio",
  scopes: ["hosting:read", "hosting:write"],
};
function fixture(rowChanges: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const targets: unknown[] = [];
  const row = {
    id: "123",
    project_id: "234",
    customer_id: "345",
    name: "Customer database",
    backend_id: "456",
    revision: 1,
    credential_revision: 2,
    confirmed_credential_revision: 2,
    state: "ready",
    backend_state: "ready",
    endpoint_ready: true,
    ca_certificate: "private-ca",
    confirmed_credentials_encrypted: "private-sealed",
    ...rowChanges,
  };
  const db = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.includes("FOR SHARE OF d,b")) return { rows: [row] };
      if (sql.includes("INSERT INTO webdock_auth.managed_database_launch"))
        return { rows: [{ expires_at: new Date(Date.now() + 60000) }] };
      throw Error("Unexpected query");
    },
  } as unknown as DatabaseReader;
  const dependencies: DatabaseServiceDependencies = {
    authorizeHosting: async (_actor, target) => {
      targets.push(target);
      return { operator: false, canWrite: true };
    },
    hostingAudit: async () => {},
    encryptMailSecret: () => {
      throw Error("Unexpected encryption");
    },
    decryptMailSecret: () => {
      throw Error("Unexpected decryption");
    },
    gatewayOrigin: () => "https://gateway.example",
  };
  return {
    db,
    calls,
    targets,
    service: createDatabaseService(dependencies),
    dependencies,
  };
}
test("managed launch retains row locks, tenant-admin authorization and credential-free public response", async () => {
  const { service, db, calls, targets } = fixture();
  const launch = await service.executeDatabase(db, actor, {
    action: "openManaged",
    databaseID: "123",
  });
  assert.ok(calls[0].includes("FOR SHARE OF d,b"));
  assert.deepEqual(targets, [
    { projectID: "234", write: true, tenantAdmin: true, live: true },
  ]);
  assert.equal((launch as { binding: { id: string } }).binding.id, "123");
  assert.equal(JSON.stringify(launch).includes("private-"), false);
});
test("pending revision, unhealthy backend and unavailable authorization prevent launch issuance", async () => {
  for (const patch of [
    { confirmed_credential_revision: 1 },
    { pending_backend_id: "789" },
    { endpoint_ready: false },
    { state: "suspended" },
  ]) {
    const { service, db, calls } = fixture(patch);
    await assert.rejects(
      service.executeDatabase(db, actor, {
        action: "openManaged",
        databaseID: "123",
      }),
    );
    assert.equal(calls.length, 1);
  }
  const { dependencies, db, calls } = fixture();
  dependencies.authorizeHosting = async () => {
    throw Error("authorization-denied");
  };
  await assert.rejects(
    createDatabaseService(dependencies).executeDatabase(db, actor, {
      action: "list",
      customerID: "345",
    }),
  );
  assert.equal(calls.length, 0);
});
test("non-Studio actors cannot launch or manage bindings", async () => {
  const { service, db, calls } = fixture();
  await assert.rejects(
    service.executeDatabase(
      db,
      { ...actor, source: "api-key" } as HostingActor,
      { action: "openManaged", databaseID: "123" },
    ),
  );
  assert.equal(calls.length, 0);
});
