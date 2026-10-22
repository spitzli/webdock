// The surface first-party plugin UIs (`plugins/<id>/ui`) import as `@webdock/plugin-ui`.
// Every call goes through the plugin action API, so the Core gates apply exactly as for panels.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ComponentType } from "react";
import type { z } from "zod";
import { useApi } from "../context";
import { invokePlugin } from "./views";
export * as ui from "../ui";
export { Empty, Failure, Loading } from "../common";

export interface PluginContext { plugin: string; projectID: string }
export interface PluginResource { id: string; offering: string; name: string; createdVia: "operator" | "self-service" }
export interface ResourceProps extends PluginContext {
  customer: string;
  resource: PluginResource;
  /** Self-service features this viewer may use here (operators: all). */
  features: string[];
  /** Whether the viewer may run write actions at all (owner, admin or operator). */
  writable: boolean;
  /** Call after a delete action succeeded; returns to the project. */
  onDeleted: () => void;
}
export interface OperatorResource extends Omit<PluginResource, "createdVia"> {
  createdVia: PluginResource["createdVia"];
  customer: { id: string; name: string };
  project: { id: string; name: string };
}
export interface OperatorProps { plugin: string; resources: OperatorResource[] }
/** What a plugin UI module default-exports. Missing pages fall back to declarative panels. */
export interface PluginUI {
  Resource?: ComponentType<ResourceProps>;
  Operator?: ComponentType<OperatorProps>;
}

export function usePluginQuery<T>(
  context: PluginContext,
  action: string,
  input: Record<string, unknown>,
  schema: z.ZodType<T>,
  options: { refetchInterval?: (data: T | undefined) => number | false } = {},
) {
  const api = useApi();
  return useQuery({
    queryKey: ["plugin-ui", context.plugin, context.projectID, action, input],
    queryFn: async ({ signal }) => schema.parse(await invokePlugin(api, context.plugin, context.projectID, action, input, signal)),
    retry: false,
    refetchInterval: (query) => options.refetchInterval?.(query.state.data) ?? false,
  });
}
/** A write; on success every query of this plugin in this project refetches. */
export function usePluginMutation(context: PluginContext, action: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => invokePlugin(api, context.plugin, context.projectID, action, input),
    onSuccess: () => client.invalidateQueries({ queryKey: ["plugin-ui", context.plugin, context.projectID] }),
  });
}
/** Reads a value once on demand, never cached: for credentials behind a reveal. */
export function usePluginReveal(context: PluginContext, action: string) {
  const api = useApi();
  return useMutation({ mutationFn: (input: Record<string, unknown>) => invokePlugin(api, context.plugin, context.projectID, action, input) });
}
