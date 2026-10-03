"use client";
import { useActionState } from "react";
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
  return (
    <form action={formAction} className="editor">
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      {fields.map((f) => (
        <div
          className={"field " + (f.type === "textarea" ? "wide" : "")}
          key={f.name}
        >
          <label htmlFor={f.name}>
            {f.label}
            {f.required && <span aria-hidden="true"> *</span>}
          </label>
          {f.type === "textarea" ? (
            <textarea
              id={f.name}
              name={f.name}
              rows={4}
              maxLength={3000}
              defaultValue={state.values?.[f.name] ?? f.value}
            />
          ) : f.type === "select" ? (
            <select
              id={f.name}
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
              id={f.name}
              name={f.name}
              type="checkbox"
              value="yes"
              required={f.required}
              defaultChecked={state.values?.[f.name] === "yes"}
            />
          ) : (
            <input
              id={f.name}
              name={f.name}
              type={f.type || "text"}
              required={f.required}
              readOnly={f.readOnly}
              maxLength={f.type === "url" ? 2048 : 160}
              defaultValue={state.values?.[f.name] ?? f.value ?? ""}
            />
          )}
          {f.hint && <small>{f.hint}</small>}
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
      <button className="text-button" disabled={pending}>
        {archived ? "Restore record" : "Archive record"}
      </button>
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
    </form>
  );
}
