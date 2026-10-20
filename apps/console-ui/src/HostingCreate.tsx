import { useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { createCommand } from "./hosting-contracts";
import { useHostingAction } from "./hosting-client";
import { HostingReceipt } from "./HostingOperation";
import { ActionFailure } from "./HostingActionState";
import { HostingEnvironment } from "./HostingEnvironment";
export function HostingCreate({ projectID, subscriptionRevision }: { projectID: string; subscriptionRevision: number }) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [validation, setValidation] = useState<string>();
  const { mutation, retry, uncertain } = useHostingAction(() => { setDirty(false); });
  useBlocker({
    shouldBlockFn: () => (dirty || uncertain) && !window.confirm("Leave this view? The new application has not been requested, or its request outcome is unknown."),
    enableBeforeUnload: dirty || uncertain,
  });
  const locked = mutation.isPending || uncertain || Boolean(mutation.data);
  if (!open)
    return <button className="button primary" onClick={() => { setOpen(true); }}>New application</button>;
  return <section className="security-section mt-4" aria-label="New application">
    <h2>New application</h2>
    <form className="editor" onChange={() => { setDirty(true); }} onSubmit={(event) => {
      event.preventDefault();
      try {
        const command = createCommand(projectID, subscriptionRevision, new FormData(event.currentTarget), crypto.randomUUID());
        setValidation(undefined);
        mutation.mutate(command);
      } catch {
        setValidation("Check the name, image digest, arguments, resources and environment variables. Persistent storage supports one replica.");
      }
    }}>
      <fieldset disabled={locked}>
        <legend>Deployment configuration</legend>
        <label>Application name<input name="name" required maxLength={63} autoComplete="off" /></label>
        <label>Image digest<input name="image" aria-label="Image digest" required maxLength={512} placeholder="registry.example/app@sha256:…" autoComplete="off" spellCheck={false} />
          <span className="field-hint">An immutable image reference pinned by digest.</span></label>
        <label>Startup arguments<textarea name="args" aria-label="Startup arguments" rows={3} required defaultValue="[]" />
          <span className="field-hint">A JSON list of arguments. Use [] for the image default.</span></label>
        <label>Application port<input name="port" type="number" min={1024} max={65535} required defaultValue={8080} /></label>
        <label>Health path<input name="healthPath" required maxLength={160} defaultValue="/" /></label>
        <label>CPU<input name="cpuMillicores" aria-label="CPU" required defaultValue="0.1 cores" /></label>
        <label>Memory<input name="memoryBytes" aria-label="Memory" required defaultValue="128 MB" /></label>
        <label>Temporary storage<input name="ephemeralBytes" required defaultValue="64 MB" /></label>
        <label>Replicas<input name="replicas" type="number" min={0} max={20} step={1} required defaultValue={1} /></label>
        <label>Persistent storage<input name="volumeBytes" aria-label="Persistent storage" required defaultValue="0 MB" />
          <span className="field-hint">0 MB for none; otherwise at least 64 MB and one replica.</span></label>
      </fieldset>
      <HostingEnvironment names={[]} disabled={locked} changed={() => { setDirty(true); }} />
      {validation ? <p className="error" role="alert">{validation}</p> : null}
      <div className="form-actions">
        <button className="button primary" disabled={locked}>{mutation.isPending ? "Submitting…" : "Request application"}</button>
        <button type="button" className="button" disabled={mutation.isPending || uncertain} onClick={() => {
          if (dirty && !window.confirm("Discard this new application?")) return;
          setDirty(false); setOpen(false); mutation.reset();
        }}>Close</button>
      </div>
      <ActionFailure error={mutation.error} uncertain={uncertain} retry={retry} pending={mutation.isPending} />
      {mutation.data ? <>
        <HostingReceipt receipt={mutation.data} />
        <Link className="button mt-2" to="/hosting/apps/$appID" params={{ appID: mutation.data.appID }}>Open new application</Link>
      </> : null}
    </form>
  </section>;
}
