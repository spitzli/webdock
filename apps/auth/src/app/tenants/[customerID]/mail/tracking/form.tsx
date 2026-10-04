"use client";
import { useActionState, type ReactNode } from "react";
import { trackingAction } from "./actions";
export function TrackingForm({ customer, action, label, children, confirm }: { customer: string; action: string; label: string; children?: ReactNode; confirm?: string }) {
 const [state, submit, pending] = useActionState(trackingAction, {});
 return <form action={submit} className="access-form" aria-busy={pending}>
  <input type="hidden" name="customer" value={customer} /><input type="hidden" name="action" value={action} />
  <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: 14 }}>{children}
   {confirm && <label className="check"><input type="checkbox" name="confirm" value="yes" required />{confirm}</label>}
   <button className="button secondary" type="submit">{pending ? "Working…" : label}</button>
  </fieldset>
  {state.error && <p className="notice error" role="alert">{state.error}</p>}{state.message && <p className="notice" role="status">{state.message}</p>}
 </form>;
}
