import { useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi, useSession } from "../context";
import { Empty, Failure, Loading, Modal } from "../common";
import { ActionFailure } from "../HostingActionState";
import { uncertainOutcome } from "../hosting-client";
import {
  availability,
  blockerText,
  extensionReceipt,
  installedSchema,
  stateRequest,
  type Installation,
  type StateRequest,
} from "./lifecycle-contracts";
export function InstalledExtensions() {
  const api = useApi();
  const session = useSession();
  const allowed = session.user.role === "operator" && !session.user.preview;
  const query = useQuery({
    queryKey: ["installed-extensions"],
    queryFn: ({ signal }) =>
      api.get("/api/console/plugins/installed", installedSchema, signal),
    enabled: allowed,
  });
  const [selected, setSelected] = useState<Installation>();
  if (!allowed)
    return (
      <Empty title="Operator access required">
        Installation availability is managed by an operator outside customer
        preview.
      </Empty>
    );
  if (query.isPending) return <Loading>Loading installed extensions…</Loading>;
  if (query.error)
    return <Failure error={query.error} retry={() => void query.refetch()} />;
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Installed extensions</h1>
          <p className="muted">
            Review availability, runtime state and dependencies.
          </p>
        </div>
        <button
          className="button"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          Refresh
        </button>
      </div>
      <p className="muted mb-4">
        Disabling stops new authorized work and may wait for accepted work to
        drain. The current controller retains deployed processes and data; this
        is not an uninstall or process shutdown.
      </p>
      {query.data.length === 0 ? (
        <Empty title="No installation records">
          No installed extensions were returned by the server. Source
          installation is not yet available in this Console.
        </Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Extension</th>
                <th scope="col">Availability</th>
                <th scope="col">Runtime</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((plugin) => (
                <tr key={plugin.id}>
                  <td>
                    <strong>{plugin.id}</strong>
                    <span className="record-meta">
                      {plugin.kind === "builtin" ? "Built-in" : "External"} ·{" "}
                      {plugin.version}
                    </span>
                    {plugin.dependencies.length ? (
                      <p className="muted">
                        Requires{" "}
                        {plugin.dependencies
                          .map((value) => value.id)
                          .join(", ")}
                      </p>
                    ) : null}
                    {plugin.blockers.map((blocker, index) => (
                      <p key={index} className="error">
                        {blockerText(blocker)}
                      </p>
                    ))}
                  </td>
                  <td>
                    {plugin.state}
                    <span className="record-meta">
                      Requested: {plugin.desiredState}
                    </span>
                  </td>
                  <td>{plugin.runtime}</td>
                  <td>
                    <button
                      className="button"
                      onClick={() => {
                        setSelected(plugin);
                      }}
                    >
                      Change availability
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected ? (
        <ExtensionStateForm
          key={`${selected.id}:${selected.revision}`}
          plugin={selected}
          close={() => {
            setSelected(undefined);
          }}
        />
      ) : null}
    </section>
  );
}
function ExtensionStateForm({
  plugin,
  close,
}: {
  plugin: Installation;
  close: () => void;
}) {
  const api = useApi();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (request: StateRequest) =>
      api.write(
        "/api/console/plugins/installed",
        "POST",
        request,
        extensionReceipt,
      ),
    retry: false,
    gcTime: 0,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["installed-extensions"] });
    },
  });
  const uncertain = uncertainOutcome(mutation.error);
  const [confirmed, setConfirmed] = useState(false);
  useBlocker({
    shouldBlockFn: () =>
      uncertain &&
      !window.confirm(
        "This request's outcome is unknown. Leave and review the installation state?",
      ),
    enableBeforeUnload: uncertain,
  });
  const dismiss = () => {
    if (mutation.isPending) return;
    if (
      uncertain &&
      !window.confirm(
        "The outcome is unknown. Close and refresh the installation state before another request?",
      )
    )
      return;
    close();
  };
  return (
    <Modal title={`Availability: ${plugin.id}`} close={dismiss}>
      {mutation.data ? (
        <div role="status">
          <h3>Request recorded: {mutation.data.status}</h3>
          <p>
            Availability changes only after the controller processes this
            operation.
          </p>
          <Link
            className="button mt-4"
            to="/extensions/operations/$operationID"
            params={{ operationID: mutation.data.id }}
          >
            View operation
          </Link>
        </div>
      ) : (
        <form
          className="editor"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            mutation.mutate(
              stateRequest(
                plugin.id,
                plugin.revision,
                availability.parse(data.get("desired")),
                crypto.randomUUID(),
              ),
            );
          }}
        >
          <p>
            Reviewed revision {plugin.revision}. Current availability:{" "}
            {plugin.state}; requested: {plugin.desiredState}; runtime:{" "}
            {plugin.runtime}.
          </p>
          <label>
            Requested availability
            <select
              name="desired"
              aria-label="Requested availability"
              defaultValue={plugin.desiredState}
              disabled={mutation.isPending || uncertain}
            >
              <option value="enabled">Enabled</option>
              <option value="draining">Draining</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
          <p>
            Disabling retains deployed processes and stored data. Dependencies
            or accepted work can block the transition.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => {
                setConfirmed(event.target.checked);
              }}
              disabled={mutation.isPending || uncertain}
            />
            I reviewed the requested availability change.
          </label>
          <button
            className="button primary"
            disabled={!confirmed || mutation.isPending || uncertain}
          >
            {mutation.isPending ? "Requesting…" : "Request availability change"}
          </button>
        </form>
      )}
      <ActionFailure
        error={mutation.error}
        uncertain={uncertain}
        pending={mutation.isPending}
        retry={() => {
          if (mutation.variables) mutation.mutate(mutation.variables);
        }}
      />
    </Modal>
  );
}
