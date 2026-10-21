import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useApi, useSession } from "../context";
import { Failure, Loading } from "../common";
import { ApiError } from "../api";
import { PluginPanel } from "./Panel";
// Discovery is scoped by the Core to current project access and grants; admission is rechecked per call.
const slotSchema = z.object({ id: z.string(), slot: z.string(), label: z.string(), action: z.string().optional() });
const viewsSchema = z.array(z.object({
  state: z.string(),
  runtime: z.string(),
  manifest: z.object({ name: z.string(), slots: z.array(slotSchema).max(32).default([]) }),
})).max(64);
interface Panel { plugin: string; slot: string; label: string; action: string; active: boolean }
export function ProjectExtensions({ projectID }: { projectID: string }) {
  const api = useApi();
  const session = useSession();
  const query = useQuery({
    queryKey: ["project-extensions", session.session.id, projectID],
    queryFn: ({ signal }) => api.get(`/api/console/plugins?projectID=${encodeURIComponent(projectID)}`, viewsSchema, signal),
  });
  if (query.isPending) return <Loading>Loading project extensions…</Loading>;
  // Installations without a plugin host answer "unavailable"; that is not a page error.
  if (query.error instanceof ApiError && [404, 503].includes(query.error.status)) return null;
  if (query.error) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const panels: Panel[] = query.data.flatMap((view) => view.manifest.slots
    .filter((slot) => slot.slot === "project.overview.panel" && slot.action)
    .map((slot) => ({ plugin: view.manifest.name, slot: slot.id, label: slot.label, action: slot.action ?? "", active: view.state === "enabled" && view.runtime === "ready" && !session.user.preview })));
  if (!panels.length) return null;
  return <section aria-label="Project extensions" className="mt-6 grid gap-6">
    {panels.map((panel) => <ExtensionPanel key={`${panel.plugin}:${panel.slot}`} projectID={projectID} panel={panel} />)}
  </section>;
}
function ExtensionPanel({ projectID, panel }: { projectID: string; panel: Panel }) {
  const api = useApi();
  const invoke = (action: string, input: Record<string, unknown>, signal?: AbortSignal) => api.request("/api/console/plugins/invoke", z.unknown(), {
    method: "POST", signal: signal ?? null,
    body: JSON.stringify({ pluginID: panel.plugin, projectID, action, input, idempotencyKey: crypto.randomUUID() }),
  });
  const [value, setValue] = useState<unknown>();
  const initial = useQuery({
    queryKey: ["project-extension-panel", panel.plugin, projectID, panel.slot],
    queryFn: ({ signal }) => invoke(panel.action, {}, signal),
    enabled: panel.active, retry: false,
  });
  if (!panel.active) return <p className="text-sm text-muted">{panel.label}: extension is unavailable.</p>;
  if (initial.isPending) return <Loading>Loading {panel.label}…</Loading>;
  if (initial.error) return <Failure error={initial.error} retry={() => void initial.refetch()} />;
  return <PluginPanel value={value ?? initial.data} active={panel.active} invoke={async (action, input, signal) => {
    const result = await invoke(action, input, signal);
    // A panel action that returns a panel replaces the view; other results only confirm completion.
    if (action === panel.action) setValue(result);
    return result;
  }} />;
}
