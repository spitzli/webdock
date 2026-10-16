import { createRegistry, type ModuleManifest, moduleStates } from "./index";
/** The same static manifests used by a runtime define the installation schema. */
export function installationJSONSchema(manifests: readonly ModuleManifest[]) {
  createRegistry(manifests);
  const states = moduleStates;
  const entry = {
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["enabled"],
        properties: { enabled: { type: "boolean" } },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["state"],
        properties: { state: { enum: states } },
      },
    ],
  };
  const active = {
    anyOf: [
      { required: ["enabled"], properties: { enabled: { const: true } } },
      {
        required: ["state"],
        properties: { state: { enum: ["enabled", "draining"] } },
      },
    ],
  };
  const dependencies = manifests.flatMap((manifest) =>
    manifest.dependencies.map((dependency) => ({
      if: { required: [manifest.id], properties: { [manifest.id]: active } },
      then: { required: [dependency], properties: { [dependency]: active } },
    })),
  );
  return {
    type: "object",
    additionalProperties: false,
    required: ["configVersion", "modules"],
    properties: {
      configVersion: { const: 1 },
      modules: {
        type: "object",
        additionalProperties: false,
        properties: Object.fromEntries(
          [...manifests]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((manifest) => [manifest.id, entry]),
        ),
        ...(dependencies.length ? { allOf: dependencies } : {}),
      },
    },
  };
}
