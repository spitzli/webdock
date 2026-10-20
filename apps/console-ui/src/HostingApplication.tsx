import { useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { commandSchema, formatResource } from "@webdock/hosting-contracts";
import { useApi, useSession } from "./context";
import { Empty, Failure, Loading, Modal } from "./common";
import { useHostingAction, useHostingCommand } from "./hosting-client";
import {
  appSchema,
  actionCommand,
  canManageApp,
  type HostingApp,
  type LifecycleAction,
} from "./hosting-contracts";
import {
  HostingReceipt,
  HostingOperationLink,
  HostingLogRead,
  useHostingActionCompletion,
} from "./HostingOperation";
import { HostingSettings } from "./HostingSettings";
import { ActionFailure } from "./HostingActionState";
const labels = {
  "apps.start": "Start application",
  "apps.stop": "Stop application",
  "apps.restart": "Restart application",
  "apps.rollback": "Rollback application",
  "apps.scale": "Scale application",
} satisfies Record<LifecycleAction, string>;
export function HostingApplication({
  appID,
  view = "overview",
}: {
  appID: string;
  view?: "overview" | "settings" | "logs";
}) {
  const api = useApi();
  const session = useSession();
  const call = useHostingCommand();
  const enabled = api.config.enabledFeatures.includes("hosting");
  const app = useQuery({
    queryKey: ["hosting", "app", appID],
    queryFn: ({ signal }) =>
      call({ action: "apps.get", appID }, appSchema, signal),
    enabled,
  });
  if (!enabled)
    return (
      <Empty title="Hosting is unavailable">
        Hosting is not enabled for this installation.
      </Empty>
    );
  if (app.isPending) return <Loading>Loading application…</Loading>;
  if (app.error)
    return <Failure error={app.error} retry={() => void app.refetch()} />;
  return (
    <section>
      <div className="page-heading">
        <div>
          <Link
            className="back-link"
            to="/hosting/projects/$projectID"
            params={{ projectID: app.data.projectID }}
          >
            Project applications
          </Link>
          <h1>{app.data.name}</h1>
          <p className="muted">
            {app.data.id} · Recorded state: {app.data.status}
          </p>
        </div>
        <button
          className="button"
          disabled={app.isFetching}
          onClick={() => void app.refetch()}
        >
          Refresh application
        </button>
      </div>
      <nav className="context-links" aria-label="Application">
        <Link
          to="/hosting/apps/$appID"
          params={{ appID }}
          aria-current={view === "overview" ? "page" : undefined}
        >
          Overview
        </Link>
        <Link
          to="/hosting/apps/$appID/logs"
          params={{ appID }}
          aria-current={view === "logs" ? "page" : undefined}
        >
          Logs
        </Link>
        <Link
          to="/hosting/apps/$appID/settings"
          params={{ appID }}
          aria-current={view === "settings" ? "page" : undefined}
        >
          Settings
        </Link>
      </nav>
      {session.user.preview ? (
        <p className="state" role="status">
          Customer preview is read-only. Live log requests and application
          changes are unavailable.
        </p>
      ) : null}
      {app.data.lastError ? (
        <p className="error mb-4" role="alert">
          Last recorded error: {app.data.lastError}
        </p>
      ) : null}
      {app.data.operationID ? (
        <HostingOperationLink id={app.data.operationID} />
      ) : null}
      {app.data.lifecycle === "draft" ? (
        <Empty title="Awaiting first deployment">
          This application has not been deployed. Deployment source setup is not
          yet available in this Console.
        </Empty>
      ) : (
        <>
          {view === "overview" ? (
            <>
              <ApplicationSummary app={app.data} />
              {canManageApp(app.data, session.user.preview === true) ? (
                <ApplicationControls key={appID} app={app.data} />
              ) : (
                <p className="muted mt-4">
                  Application changes are unavailable with your current access
                  or application state.
                </p>
              )}
            </>
          ) : null}
          {view === "settings" ? (
            canManageApp(app.data, session.user.preview === true) ? (
              <HostingSettings key={appID} app={app.data} />
            ) : (
              <Empty title="Settings are read-only">
                You cannot change this application with its current state or
                your current access.
              </Empty>
            )
          ) : null}
          {view === "logs" ? (
            <ApplicationLogs key={appID} app={app.data} />
          ) : null}
        </>
      )}
    </section>
  );
}
function ApplicationSummary({ app }: { app: HostingApp }) {
  return (
    <section className="security-section">
      <h2>Configured resources</h2>
      <dl className="detail-grid grid-cols-2 md:grid-cols-3">
        {[
          ["Desired revision", String(app.revision)],
          ["Observed revision", String(app.observedRevision)],
          ["Replicas", String(app.spec.replicas)],
          [
            "CPU cores",
            formatResource("cpuMillicores", app.spec.cpuMillicores),
          ],
          ["Memory", formatResource("memoryBytes", app.spec.memoryBytes)],
          [
            "Persistent storage",
            formatResource("volumeBytes", app.spec.volumeBytes ?? 0),
          ],
        ].map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {app.observedRevision < app.revision ? (
        <p role="status">
          The runtime has not confirmed the desired revision. Review the latest
          operation.
        </p>
      ) : null}
      {app.status === "deleted" ? (
        <p>
          Application resources are deleted. Any retained storage remains a
          separate resource.
        </p>
      ) : null}
    </section>
  );
}
function ApplicationControls({ app }: { app: HostingApp }) {
  const { mutation, retry, uncertain } = useHostingAction();
  useHostingActionCompletion(mutation.data, app.id, mutation.reset);
  const [review, setReview] = useState<{
    action: LifecycleAction;
    app: HostingApp;
  }>();
  useBlocker({
    shouldBlockFn: () =>
      uncertain &&
      !window.confirm(
        "This request's outcome is unknown. Leave this view and review the server state?",
      ),
    enableBeforeUnload: uncertain,
  });
  const pending =
    mutation.isPending ||
    uncertain ||
    Boolean(mutation.data) ||
    app.status === "pending";
  const actions: LifecycleAction[] = [
    app.spec.replicas === 0 ? "apps.start" : "apps.stop",
    "apps.restart",
    "apps.rollback",
    "apps.scale",
  ];
  return (
    <section className="security-section mt-6">
      <h2>Application controls</h2>
      <div className="flex flex-wrap gap-2 mt-4">
        {actions.map((action) => (
          <button
            key={action}
            className="button"
            disabled={pending}
            onClick={() => {
              mutation.reset();
              setReview({ action, app });
            }}
          >
            {labels[action]}
          </button>
        ))}
      </div>
      <ActionFailure
        error={mutation.error}
        uncertain={uncertain}
        retry={retry}
        pending={mutation.isPending}
      />
      {mutation.data ? <HostingReceipt receipt={mutation.data} /> : null}
      {review ? (
        <Modal
          title={labels[review.action]}
          close={() => {
            setReview(undefined);
          }}
        >
          <form
            className="editor"
            onSubmit={(event) => {
              event.preventDefault();
              const value = new FormData(event.currentTarget).get("replicas");
              mutation.mutate(
                actionCommand(
                  review.app,
                  review.action,
                  crypto.randomUUID(),
                  Number(value),
                ),
              );
              setReview(undefined);
            }}
          >
            <p>
              This sends a request for revision {review.app.revision}. Traffic
              may be interrupted. The assigned runtime must confirm completion.
            </p>
            {review.action === "apps.scale" ? (
              <label>
                Replicas
                <input
                  name="replicas"
                  type="number"
                  min={0}
                  max={20}
                  step={1}
                  defaultValue={review.app.spec.replicas}
                  required
                />
              </label>
            ) : null}
            <button className="button primary">
              Confirm {labels[review.action].toLowerCase()}
            </button>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}
function ApplicationLogs({ app }: { app: HostingApp }) {
  const session = useSession();
  const { mutation, retry, uncertain } = useHostingAction();
  const [completed, setCompleted] = useState(false);
  const allowed =
    app.canRequestLogs && !session.user.preview && app.status !== "deleted";
  return (
    <section className="security-section">
      <h2>Recorded logs</h2>
      <p className="muted">
        This is the last stored, sanitized log snapshot. A refresh queues a new
        read; it is not a live stream.
      </p>
      <button
        className="button mt-4"
        disabled={
          !allowed ||
          mutation.isPending ||
          uncertain ||
          (Boolean(mutation.data) && !completed)
        }
        onClick={() => {
          setCompleted(false);
          mutation.mutate(
            commandSchema.parse({
              action: "apps.logs",
              appID: app.id,
              idempotencyKey: crypto.randomUUID(),
            }),
          );
        }}
      >
        {mutation.isPending ? "Requesting…" : "Request fresh logs"}
      </button>
      {!allowed ? (
        <p className="muted mt-4">
          A live log request requires current access and an observed runtime. No
          current log-read capability is available.
        </p>
      ) : null}
      <ActionFailure
        error={mutation.error}
        uncertain={uncertain}
        retry={retry}
        pending={mutation.isPending}
      />
      {mutation.data ? (
        <HostingLogRead id={mutation.data.id} onTerminal={setCompleted} />
      ) : null}
      <div className="state mt-4">
        {app.logs === null ? (
          <p>No log snapshot has been recorded.</p>
        ) : (
          <pre className="whitespace-pre-wrap break-all">
            {app.logs || "The recorded snapshot contains no output."}
          </pre>
        )}
      </div>
    </section>
  );
}
