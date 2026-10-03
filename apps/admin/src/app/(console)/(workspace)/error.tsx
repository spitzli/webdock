"use client";
import Link from "next/link";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <section className="panel empty" role="alert">
      <h1>This view could not load</h1>
      <p>
        Your workspace data is still saved. Retry this view, or return to your
        projects.
      </p>
      <div className="error-actions">
        <button className="button" onClick={reset}>
          Try again
        </button>
        <Link className="button secondary" href="/">
          Back to projects
        </Link>
      </div>
    </section>
  );
}
