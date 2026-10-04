"use client";
import { useActionState, type ReactNode } from "react";
import { accessAction } from "./actions";
export function AccessForm({
  action,
  label,
  children,
  confirm,
}: {
  action: string;
  label: string;
  children?: ReactNode;
  confirm?: string;
}) {
  const [state, submit, pending] = useActionState(accessAction, {});
  return (
    <form action={submit} className="access-form" aria-busy={pending}>
      <input type="hidden" name="action" value={action} />
      {children}
      {confirm && (
        <label className="check">
          <input type="checkbox" required /> {confirm}
        </label>
      )}
      {state.error && (
        <p className="notice error" role="alert">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="notice" role="status">
          {state.message}
        </p>
      )}
      <button className="button secondary" disabled={pending}>
        {pending ? "Saving…" : label}
      </button>
    </form>
  );
}
export function RoleSelect({ value = "editor" }: { value?: string }) {
  return (
    <label className="field">
      Website role
      <select name="role" defaultValue={value}>
        <option value="reader">Reader — view content</option>
        <option value="editor">Editor — edit and publish content</option>
        <option value="admin">
          Administrator — manage, delete and restore content
        </option>
      </select>
    </label>
  );
}
