import { useState } from "react";
import { FieldError, useLiveValidation } from "./live-validation";
import { Link, useBlocker } from "@tanstack/react-router";
import { checkArguments, createCommand, fieldRules } from "./hosting-contracts";
import { useHostingAction } from "./hosting-client";
import { HostingReceipt } from "./HostingOperation";
import { ActionFailure } from "./HostingActionState";
import { HostingEnvironment } from "./HostingEnvironment";
export function HostingCreate({ projectID, subscriptionRevision }: { projectID: string; subscriptionRevision: number }) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [validation, setValidation] = useState<string>();
  const live = useLiveValidation();
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
    <form className="editor" {...live.form} onChange={() => { setDirty(true); }} onSubmit={(event) => {
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
        <label>Application name<input name="name" required maxLength={63} autoComplete="off" /></label><FieldError message={live.errors.name} />
        <label>Image digest<input name="image" pattern={fieldRules.image.pattern} title={fieldRules.image.title} aria-label="Image digest" required maxLength={512} placeholder="registry.example/app@sha256:…" autoComplete="off" spellCheck={false} />
          <span className="field-hint">An immutable image reference pinned by digest.</span></label><FieldError message={live.errors.image} />
        <label>Startup arguments<textarea name="args" onInput={(event) => { checkArguments(event.currentTarget); }} aria-label="Startup arguments" rows={3} required defaultValue="[]" />
          <span className="field-hint">A JSON list of arguments. Use [] for the image default.</span></label><FieldError message={live.errors.args} />
        <label>Application port<input name="port" type="number" min={1024} max={65535} required defaultValue={8080} /></label><FieldError message={live.errors.port} />
        <label>Health path<input name="healthPath" pattern={fieldRules.healthPath.pattern} title={fieldRules.healthPath.title} required maxLength={160} defaultValue="/" /></label><FieldError message={live.errors.healthPath} />
        <label>CPU<input name="cpuMillicores" pattern={fieldRules.cpuMillicores.pattern} title={fieldRules.cpuMillicores.title} aria-label="CPU" required defaultValue="0.1 cores" /></label><FieldError message={live.errors.cpuMillicores} />
        <label>Memory<input name="memoryBytes" pattern={fieldRules.bytes.pattern} title={fieldRules.bytes.title} aria-label="Memory" required defaultValue="128 MB" /></label><FieldError message={live.errors.memoryBytes} />
        <label>Temporary storage<input name="ephemeralBytes" pattern={fieldRules.bytes.pattern} title={fieldRules.bytes.title} required defaultValue="64 MB" /></label><FieldError message={live.errors.ephemeralBytes} />
        <label>Replicas<input name="replicas" type="number" min={0} max={20} step={1} required defaultValue={1} /></label><FieldError message={live.errors.replicas} />
        <label>Persistent storage<input name="volumeBytes" pattern={fieldRules.bytes.pattern} title={fieldRules.bytes.title} aria-label="Persistent storage" required defaultValue="0 MB" />
          <span className="field-hint">0 MB for none; otherwise at least 64 MB and one replica.</span></label><FieldError message={live.errors.volumeBytes} />
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
