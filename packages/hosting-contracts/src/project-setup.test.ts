import test from "node:test";
import assert from "node:assert/strict";
import { setupCommandSchema } from "./project-setup";
const configuration = {
  name: "web",
  source: { kind: "git", branch: "main", rootDirectory: "." },
  spec: {
    args: [],
    port: 3000,
    healthPath: "/",
    cpuMillicores: 100,
    memoryBytes: 67108864,
    ephemeralBytes: 67108864,
    replicas: 1,
  },
  database: { mode: "none" },
  mail: null,
  autoPublish: false,
};
test("a Git draft can precede account consent without granting execution authority", () => {
  const command = {
    action: "setup.save",
    projectID: "11",
    revision: 0,
    configuration,
    idempotencyKey: "save-setup-draft-once",
  };
  assert.equal(setupCommandSchema.safeParse(command).success, true);
  assert.equal(
    setupCommandSchema.safeParse({ ...command, actor: { subject: "operator" } })
      .success,
    false,
  );
  assert.equal(
    setupCommandSchema.safeParse({
      ...command,
      configuration: {
        ...configuration,
        source: { ...configuration.source, rootDirectory: "../private" },
      },
    }).success,
    false,
  );
  assert.equal(
    setupCommandSchema.safeParse({
      ...command,
      configuration: {
        ...configuration,
        source: { ...configuration.source, connectionID: "0" },
      },
    }).success,
    false,
  );
});
test("confirmation accepts identity and consent references, never client prices or completion state", () => {
  const command = {
    action: "setup.confirm",
    projectID: "11",
    setupID: "12",
    revision: 1,
    previewID: "e8f18d59-1e55-4e65-b00d-cf9188c84740",
    acceptedOfferIDs: [],
    idempotencyKey: "confirm-setup-once",
  };
  assert.equal(setupCommandSchema.safeParse(command).success, true);
  for (const field of ["monthlyPriceCents", "resources", "state", "sourceSHA"])
    assert.equal(
      setupCommandSchema.safeParse({ ...command, [field]: "injected" }).success,
      false,
    );
});
