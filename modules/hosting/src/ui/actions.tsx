"use client";
import * as React from "react";
import { createContext, useContext, type ReactNode } from "react";
import type { HostingFormState, SetupActionState } from "../ui-types";
export interface HostingUIActions {
  saveHosting(
    previous: HostingFormState,
    form: FormData,
  ): Promise<HostingFormState>;
  displayEnrollment(id: string): Promise<HostingFormState>;
  saveSetup(
    previous: SetupActionState,
    form: FormData,
  ): Promise<SetupActionState>;
  confirmSetup(
    previous: SetupActionState,
    form: FormData,
  ): Promise<SetupActionState>;
}
const Actions = createContext<HostingUIActions | null>(null);
export function HostingActionsProvider({
  actions,
  children,
}: {
  actions: HostingUIActions;
  children: ReactNode;
}) {
  return <Actions.Provider value={actions}>{children}</Actions.Provider>;
}
export function useHostingActions() {
  const actions = useContext(Actions);
  if (!actions) throw Error("Hosting UI action boundary is required");
  return actions;
}
