import { useState } from "react";
import { FieldError, useLiveValidation } from "./live-validation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { resourceInput } from "@webdock/hosting-contracts";
import {
  appSchema,
  checkArguments,
  fieldRules,
  settingsCommand,
  type HostingApp,
} from "./hosting-contracts";
import { useHostingAction, useHostingCommand } from "./hosting-client";
import { HostingReceipt } from "./HostingOperation";
import { ActionFailure } from "./HostingActionState";
import { HostingEnvironment } from "./HostingEnvironment";
export function HostingSettings({ app }: { app: HostingApp }) {
  const [snapshot, setSnapshot] = useState(app);
  const [editorVersion, setEditorVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [validation, setValidation] = useState<string>();
  const live = useLiveValidation();
  const { mutation, retry, uncertain } = useHostingAction(() => {
    setDirty(false);
  });
  const call = useHostingCommand();
  const client = useQueryClient();
  const reload = useMutation({
    mutationFn: () => call({ action: "apps.get", appID: app.id }, appSchema),
    onSuccess: (fresh) => {
      client.setQueryData(["hosting", "app", app.id], fresh);
      setSnapshot(fresh);
      setEditorVersion((value) => value + 1);
      setDirty(false);
      setValidation(undefined);
      mutation.reset();
    },
  });
  useBlocker({
    shouldBlockFn: () =>
      (dirty || uncertain) &&
      !window.confirm(
        "Leave this view? Unsaved settings or an unconfirmed request will need to be reviewed again.",
      ),
    enableBeforeUnload: dirty || uncertain,
  });
  const locked =
    mutation.isPending ||
    reload.isPending ||
    uncertain ||
    Boolean(mutation.data);
  if (snapshot.lifecycle !== "deployed")
    return <p>Deploy this application before changing its settings.</p>;
  const changed =
    snapshot.revision !== app.revision ||
    snapshot.subscriptionRevision !== app.subscriptionRevision;
  return (
    <div className="editor-layout">
      <form
        className="editor" {...live.form}
        key={editorVersion}
        onChange={() => {
          setDirty(true);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const command = settingsCommand(
              snapshot,
              new FormData(event.currentTarget),
              crypto.randomUUID(),
            );
            setValidation(undefined);
            mutation.mutate(command);
          } catch {
            setValidation(
              "Check the image digest, arguments, resource values and environment variables. Use valid JSON for startup arguments.",
            );
          }
        }}
      >
        <h2>Application settings</h2>
        {changed ? (
          <p role="status">
            The server has a newer revision. Your entries have been preserved;
            reload current settings before submitting a new change.
          </p>
        ) : null}
        <fieldset disabled={locked}>
          <legend>Deployment configuration</legend>
          <label>
            Image digest
            <input
              name="image" pattern={fieldRules.image.pattern} title={fieldRules.image.title}
              required
              maxLength={512}
              defaultValue={snapshot.spec.image}
              readOnly={snapshot.spec.template === "healthcheck"}
            />
          </label><FieldError message={live.errors.image} />
          <label>
            Startup arguments
            <textarea
              name="args" onInput={(event) => { checkArguments(event.currentTarget); }}
              aria-label="Startup arguments"
              rows={4}
              required
              defaultValue={JSON.stringify(snapshot.spec.args, null, 2)}
              readOnly={snapshot.spec.template === "healthcheck"}
            />
            <span className="field-hint">
              A JSON list of arguments. Use [] for no arguments.
            </span>
          </label><FieldError message={live.errors.args} />
          <label>
            Application port
            <input
              name="port"
              type="number"
              min={1024}
              max={65535}
              required
              defaultValue={snapshot.spec.port}
              readOnly={snapshot.spec.template === "healthcheck"}
            />
          </label><FieldError message={live.errors.port} />
          <label>
            Health path
            <input
              name="healthPath" pattern={fieldRules.healthPath.pattern} title={fieldRules.healthPath.title}
              required
              maxLength={160}
              defaultValue={snapshot.spec.healthPath}
              readOnly={snapshot.spec.template === "healthcheck"}
            />
          </label><FieldError message={live.errors.healthPath} />
          <label>
            CPU
            <input
              name="cpuMillicores" pattern={fieldRules.cpuMillicores.pattern} title={fieldRules.cpuMillicores.title}
              aria-label="CPU"
              required
              defaultValue={resourceInput(
                "cpuMillicores",
                snapshot.spec.cpuMillicores,
              )}
            />
            <span className="field-hint">For example, 0.5 cores.</span>
          </label><FieldError message={live.errors.cpuMillicores} />
          <label>
            Memory
            <input
              name="memoryBytes" pattern={fieldRules.bytes.pattern} title={fieldRules.bytes.title}
              aria-label="Memory"
              required
              defaultValue={resourceInput(
                "memoryBytes",
                snapshot.spec.memoryBytes,
              )}
            />
            <span className="field-hint">For example, 512 MB.</span>
          </label><FieldError message={live.errors.memoryBytes} />
          <label>
            Temporary storage
            <input
              name="ephemeralBytes" pattern={fieldRules.bytes.pattern} title={fieldRules.bytes.title}
              required
              defaultValue={resourceInput(
                "ephemeralBytes",
                snapshot.spec.ephemeralBytes,
              )}
            />
          </label><FieldError message={live.errors.ephemeralBytes} />
          <label>
            Replicas
            <input
              name="replicas"
              type="number"
              min={0}
              max={20}
              step={1}
              required
              defaultValue={snapshot.spec.replicas}
            />
          </label><FieldError message={live.errors.replicas} />
        </fieldset>
        <HostingEnvironment
          names={snapshot.environmentNames ?? []}
          disabled={locked}
          changed={() => {
            setDirty(true);
          }}
        />
        {validation ? (
          <p className="error" role="alert">
            {validation}
          </p>
        ) : null}
        <div className="form-actions">
          <button
            className="button primary"
            disabled={!dirty || locked || changed}
          >
            {mutation.isPending ? "Submitting…" : "Request update"}
          </button>
          {dirty ? <span className="muted">Unsaved settings</span> : null}
        </div>
        <ActionFailure
          error={mutation.error}
          uncertain={uncertain}
          retry={retry}
          pending={mutation.isPending}
        />
        {mutation.data ? <HostingReceipt receipt={mutation.data} /> : null}
      </form>
      <aside className="editor-aside">
        <h2>Reviewed configuration</h2>
        <p>
          Revision {snapshot.revision}; allowance revision{" "}
          {snapshot.subscriptionRevision}.
        </p>
        <p className="muted">
          The runtime validates supported resources and available capacity. A
          recorded request is not a completed deployment.
        </p>
        <button
          className="button mt-4"
          disabled={mutation.isPending || reload.isPending || uncertain}
          onClick={() => {
            if (
              dirty &&
              !window.confirm(
                "Discard your entries and load the current server settings?",
              )
            )
              return;
            reload.mutate();
          }}
        >
          {reload.isPending ? "Loading…" : "Load current settings"}
        </button>
        {reload.error ? (
          <p className="error" role="alert">
            {reload.error.message}
          </p>
        ) : null}
        <h3 className="mt-6">Persistent storage</h3>
        <p>
          {resourceInput("volumeBytes", snapshot.spec.volumeBytes ?? 0)}.
          Existing storage is preserved by updates.
        </p>
        <h3 className="mt-6">Environment variables</h3>
        <p className="muted">
          Saved values are never returned to this view. Only replaced, added or
          removed variables are sent with an update.
        </p>
      </aside>
    </div>
  );
}
