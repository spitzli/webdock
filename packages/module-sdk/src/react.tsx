"use client";
import {
  createElement,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { navigationFor, type ModuleManifest, type ModuleView } from "./index";
const Context = createContext<ModuleView>({
  revision: "unavailable",
  modules: {},
});
export function ModuleProvider({
  view,
  children,
}: {
  view: ModuleView;
  children: ReactNode;
}) {
  return createElement(Context.Provider, { value: view }, children);
}
export function useModule(id: string) {
  const view = useContext(Context);
  const state = Object.hasOwn(view.modules, id) ? view.modules[id] : "disabled";
  return {
    state,
    available: state !== "disabled",
    canProvision: state === "enabled",
    revision: view.revision,
  };
}

export function useModuleNavigation(
  manifests: readonly ModuleManifest[],
  slot: string,
) {
  return navigationFor(useContext(Context), manifests, slot);
}

export function useModuleView() { return useContext(Context); }
