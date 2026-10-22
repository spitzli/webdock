import { useQuery } from "@tanstack/react-query";
import type { PluginUI } from "./sdk";

// ponytail: first-party plugin UIs are bundled at build time; runtime loading comes with third-party React plugins.
const modules = import.meta.glob<{ default: PluginUI }>("../../../../plugins/*/ui/index.tsx");
/** The plugin's own React UI, if it ships one. Loaded only when an installed plugin is shown. */
export function useNativeUI(plugin: string | undefined) {
  const load = plugin ? modules[`../../../../plugins/${plugin}/ui/index.tsx`] : undefined;
  return useQuery({
    queryKey: ["native-ui", plugin],
    queryFn: async () => (load ? (await load()).default : null),
    staleTime: Infinity,
    enabled: plugin !== undefined,
  });
}
