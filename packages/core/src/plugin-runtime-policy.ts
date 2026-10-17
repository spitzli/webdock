import { z } from "zod";
import {
  PluginError,
  type PluginManifest,
} from "@webdock/plugin-sdk/contracts";
export type RuntimePolicy = {
  state: string;
  runtime: string;
  generation: number;
  runtimeGeneration: number;
  configurationRevision: number;
  runtimeConfigurationRevision: number;
  grantRevision: number;
  revoked: boolean;
  approved: string[];
  granted: string[];
  actions: PluginManifest["actions"];
  project: {
    id: string;
    customerID: string;
    active: boolean;
    allowed: boolean;
    canWrite: boolean;
    preview: boolean;
  };
};
export function authorizePluginAction(p: RuntimePolicy, name: string) {
  const action = p.actions.find((a) => a.name === name);
  if (
    !action ||
    p.state !== "enabled" ||
    p.runtime !== "ready" ||
    p.generation !== p.runtimeGeneration ||
    p.configurationRevision !== p.runtimeConfigurationRevision ||
    p.revoked ||
    !p.project.active ||
    !p.project.allowed ||
    p.project.preview ||
    (action.intent === "write" && !p.project.canWrite) ||
    action.capabilities.some(
      (c) => !p.approved.includes(c) || !p.granted.includes(c),
    )
  )
    throw new PluginError(
      "permission_denied",
      "Plugin action is unavailable for this project",
    );
  return action;
}

/** Operator-supplied public settings, selected by the host's authorized project ID. */
export function resolvePluginConfiguration(
  schema: PluginManifest["configuration"],
  base: Record<string, unknown>,
  overrides: Record<string, unknown> | undefined,
  projectID: string,
) {
  const own =
    overrides && Object.hasOwn(overrides, projectID)
      ? overrides[projectID]
      : {};
  if (!own || typeof own !== "object" || Array.isArray(own))
    throw new PluginError("invalid_input", "Invalid project configuration");
  const parsed = z.fromJSONSchema(schema as any).safeParse({ ...base, ...own });
  if (!parsed.success)
    throw new PluginError(
      "invalid_input",
      "Project configuration does not match the plugin schema",
    );
  return parsed.data;
}
