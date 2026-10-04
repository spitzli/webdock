"use client";
import { useActionState } from "react";
import { linkVercelProject } from "../lib/vercel-actions";
export function VercelLinkForm({
  projects,
  vercelProjects,
}: {
  projects: { id: string; name: string }[];
  vercelProjects: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(linkVercelProject, {});
  return (
    <form className="editor" action={action} aria-busy={pending}>
      <label className="field">
        Studio project
        <select name="project" required defaultValue="">
          <option value="" disabled>
            Choose a project
          </option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Vercel project
        <select name="vercelProject" required defaultValue="">
          <option value="" disabled>
            Choose an authorized project
          </option>
          {vercelProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="success" role="status">
          {state.message}
        </p>
      )}
      <div className="form-footer">
        <button
          className="button"
          disabled={pending || !projects.length || !vercelProjects.length}
        >
          {pending ? "Linking…" : "Link Vercel project"}
        </button>
      </div>
    </form>
  );
}
