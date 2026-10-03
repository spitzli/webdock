"use client";
import { useActionState, useId } from "react";
import type { FormState } from "../lib/actions";
export type EditorField = {
  name: string;
  label: string;
  type?: "text" | "email" | "url" | "textarea" | "select" | "checkbox";
  required?: boolean;
  value?: string;
  options?: { value: string; label: string }[];
  hint?: string;
  readOnly?: boolean;
};
export function Editor({
  action,
  fields,
  submit = "Save changes",
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  fields: EditorField[];
  submit?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formID = useId();
  return (
    <form action={formAction} className="editor" aria-busy={pending}>
      <p className="form-instructions">Fields marked * are required.</p>
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="success">
          {state.success}
        </p>
      )}
      {fields.map((f) => (
        <div
          className={"field " + (f.type === "textarea" ? "wide" : "")}
          key={f.name}
        >
          <label htmlFor={`${formID}-${f.name}`}>
            {f.label}
            {f.required && <span aria-hidden="true"> *</span>}
          </label>
          {f.type === "textarea" ? (
            <textarea
              id={`${formID}-${f.name}`}
              aria-describedby={f.hint ? `${formID}-${f.name}-hint` : undefined}
              name={f.name}
              rows={4}
              required={f.required}
              readOnly={f.readOnly}
              maxLength={3000}
              defaultValue={state.values?.[f.name] ?? f.value}
            />
          ) : f.type === "select" ? (
            <select
              id={`${formID}-${f.name}`}
              aria-describedby={f.hint ? `${formID}-${f.name}-hint` : undefined}
              name={f.name}
              required={f.required}
              defaultValue={state.values?.[f.name] ?? f.value ?? ""}
            >
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "checkbox" ? (
            <input
              id={`${formID}-${f.name}`}
              aria-describedby={f.hint ? `${formID}-${f.name}-hint` : undefined}
              name={f.name}
              type="checkbox"
              value="yes"
              required={f.required}
              defaultChecked={(state.values?.[f.name] ?? f.value) === "yes"}
            />
          ) : (
            <input
              id={`${formID}-${f.name}`}
              aria-describedby={f.hint ? `${formID}-${f.name}-hint` : undefined}
              name={f.name}
              type={f.type || "text"}
              required={f.required}
              readOnly={f.readOnly}
              maxLength={f.type === "url" ? 2048 : 160}
              defaultValue={state.values?.[f.name] ?? f.value ?? ""}
            />
          )}
          {f.hint && <small id={`${formID}-${f.name}-hint`}>{f.hint}</small>}
        </div>
      ))}
      <div className="form-footer">
        <button className="button" disabled={pending}>
          {pending ? "Saving…" : submit}
        </button>
      </div>
    </form>
  );
}
export function ArchiveButton({
  action,
  archived,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  archived: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="restore" value={String(archived)} />
      <details className="archive-controls" key={String(archived)}>
        <summary>{archived ? "Restore record" : "Archive record"}</summary>
        <p>
          {archived
            ? "Return this record to your active workspace."
            : "Keep this record and its history, and remove it from the active list. You can restore it later."}
        </p>
        <button className="button secondary" disabled={pending}>
          {pending
            ? "Saving…"
            : archived
              ? "Confirm restore"
              : "Confirm archive"}
        </button>
      </details>
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
    </form>
  );
}
