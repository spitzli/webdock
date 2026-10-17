/** Public metadata only. No environment access, provider clients or credentials. */
export const moduleStates = ["enabled", "draining", "disabled"] as const;
export type ModuleState = (typeof moduleStates)[number];
export type NavigationContribution = {
  readonly slot: string;
  readonly id: string;
  readonly label: string;
  readonly path: string;
};
export type ModuleManifest = {
  readonly id: string;
  readonly version: string;
  readonly sdkVersion: number;
  readonly dependencies: readonly string[];
  readonly navigation?: readonly NavigationContribution[];
};
export type ModuleView = {
  revision: string;
  modules: Record<string, ModuleState>;
};
export class ModuleError extends Error {
  readonly status = 503;
  constructor(
    readonly code: "module_disabled" | "module_draining",
    readonly moduleID: string,
  ) {
    super(
      `Module ${moduleID} is ${code === "module_disabled" ? "disabled" : "draining"}.`,
    );
    this.name = "ModuleError";
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function configurationError(): never {
  throw Error("Invalid module installation configuration");
}
export function createRegistry(
  manifests: readonly ModuleManifest[],
  config?: unknown,
) {
  const installed = new Map<string, ModuleManifest>();
  for (const manifest of manifests) {
    if (
      !/^[a-z][a-z0-9-]*$/.test(manifest.id) ||
      installed.has(manifest.id) ||
      manifest.sdkVersion !== 1 ||
      !/^\d+\.\d+\.\d+$/.test(manifest.version)
    )
      throw Error("Invalid or incompatible module manifest");
    installed.set(manifest.id, manifest);
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw Error("Module dependency cycle");
    if (visited.has(id)) return;
    const manifest = installed.get(id);
    if (!manifest) throw Error("Missing module dependency");
    visiting.add(id);
    manifest.dependencies.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  }
  installed.forEach((_, id) => visit(id));
  let selection: Record<string, unknown> | undefined;
  if (config !== undefined) {
    if (
      !object(config) ||
      config.configVersion !== 1 ||
      !object(config.modules) ||
      Object.keys(config).some(
        (key) => !["configVersion", "modules"].includes(key),
      )
    )
      configurationError();
    selection = config.modules;
    if (Object.keys(selection).some((id) => !installed.has(id)))
      configurationError();
  }
  const states: Record<string, ModuleState> = Object.create(null);
  for (const id of [...installed.keys()].sort()) {
    const value =
      selection && Object.hasOwn(selection, id) ? selection[id] : undefined;
    if (value === undefined) {
      states[id] = "disabled";
      continue;
    }
    if (!object(value) || Object.keys(value).length !== 1) configurationError();
    if (Object.hasOwn(value, "enabled") && typeof value.enabled === "boolean")
      states[id] = value.enabled ? "enabled" : "disabled";
    else if (
      Object.hasOwn(value, "state") &&
      typeof value.state === "string" &&
      moduleStates.includes(value.state as ModuleState)
    )
      states[id] = value.state as ModuleState;
    else configurationError();
  }
  for (const [id, manifest] of installed) {
    if (states[id] === "disabled") continue;
    for (const dependency of manifest.dependencies)
      if (states[dependency] === "disabled")
        throw Error(`Module ${id} requires ${dependency}`);
  }
  // Canonical, collision-free revision; contains public module metadata only.
  const revision = JSON.stringify(
    [...installed.keys()]
      .sort()
      .map((id) => [id, installed.get(id)!.version, states[id]]),
  );
  return {
    state(id: string): ModuleState {
      return states[id] ?? "disabled";
    },
    require(id: string, intent: "access" | "provision" = "access") {
      if (!states[id] || states[id] === "disabled")
        throw new ModuleError("module_disabled", id);
      if (intent === "provision" && states[id] === "draining")
        throw new ModuleError("module_draining", id);
    },
    publicView(): ModuleView {
      return { revision, modules: { ...states } };
    },
    navigation(slot: string): NavigationContribution[] {
      return manifests
        .filter((m) => states[m.id] !== "disabled")
        .flatMap((m) =>
          (m.navigation ?? [])
            .filter((n) => n.slot === slot)
            .map((n) => ({ ...n })),
        );
    },
  };
}
export function navigationFor(
  view: ModuleView,
  manifests: readonly ModuleManifest[],
  slot: string,
): NavigationContribution[] {
  return manifests
    .filter((manifest) =>
      ["enabled", "draining"].includes(view.modules[manifest.id]),
    )
    .flatMap((manifest) =>
      (manifest.navigation ?? [])
        .filter((item) => item.slot === slot)
        .map((item) => ({ ...item })),
    );
}
