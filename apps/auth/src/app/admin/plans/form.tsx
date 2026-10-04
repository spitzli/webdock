"use client";
import { useActionState, type ReactNode } from "react";
import { planAction } from "./actions";
export function PlanForm({ action, label, children }: { action: string; label: string; children: ReactNode }) {
  const [state, submit, pending] = useActionState(planAction, {});
  return <form action={submit} className="access-form" aria-busy={pending}>
    <input type="hidden" name="action" value={action} />{children}
    {state.error && <p className="notice error" role="alert">{state.error}</p>}
    {state.message && <p className="notice" role="status">{state.message}</p>}
    <button className="button secondary" disabled={pending}>{pending ? "Saving…" : label}</button>
  </form>;
}
