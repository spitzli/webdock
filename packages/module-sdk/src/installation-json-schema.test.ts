import { test } from "node:test";
import assert from "node:assert/strict";
import { installationJSONSchema } from "./installation-json-schema";
import { createRegistry } from "./index";
const manifests = [
  { id: "base", version: "0.1.0", sdkVersion: 1, dependencies: [] },
  { id: "child", version: "0.1.0", sdkVersion: 1, dependencies: ["base"] },
];
test("installation schema derives IDs, exclusive state forms and dependency requirements from manifests", () => {
  const schema = installationJSONSchema(manifests);
  assert.deepEqual(
    Object.keys(schema.properties.modules.properties),
    Object.keys(createRegistry(manifests).publicView().modules),
  );
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.modules.additionalProperties, false);
  const branches = schema.properties.modules.properties.base.oneOf;
  assert.deepEqual(
    branches.map((branch) => branch.required),
    [["enabled"], ["state"]],
  );
  for (const state of branches[1].properties.state!.enum!) {
    assert.equal(
      createRegistry(manifests, {
        configVersion: 1,
        modules: { base: { state } },
      }).state("base"),
      state,
    );
  }
  assert.equal(schema.properties.modules.allOf?.length, 1);
  assert.deepEqual(schema.properties.modules.allOf?.[0].then.required, [
    "base",
  ]);
  assert.throws(() =>
    installationJSONSchema([{ ...manifests[0], sdkVersion: 99 }]),
  );
  assert.throws(() =>
    installationJSONSchema([{ ...manifests[0], dependencies: ["missing"] }]),
  );
});
