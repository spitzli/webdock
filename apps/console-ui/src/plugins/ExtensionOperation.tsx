import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi, useSession } from "../context";
import { Empty, Failure, Loading } from "../common";
import { extensionOperation, extensionPolling } from "./lifecycle-contracts";
export function ExtensionOperation({ id }: { id: string }) {
  const api = useApi();
  const session = useSession();
  const client = useQueryClient();
  const allowed = session.user.role === "operator" && !session.user.preview;
  const query = useQuery({
    queryKey: ["extension-operation", id],
    queryFn: ({ signal }) =>
      api.get(
        `/api/console/plugins/operations/${encodeURIComponent(id)}`,
        extensionOperation,
        signal,
      ),
    enabled: allowed,
    refetchInterval: (value) =>
      extensionPolling(
        value.state.data?.status,
        value.state.status === "error",
      ),
  });
  const status = query.data?.status;
  useEffect(() => {
    if (status && !extensionPolling(status, false))
      void client.invalidateQueries({ queryKey: ["installed-extensions"] });
  }, [client, id, status]);
  if (!allowed)
    return (
      <Empty title="Operator access required">
        Operation details are unavailable in this account context.
      </Empty>
    );
  if (query.isPending) return <Loading>Loading extension operation…</Loading>;
  if (query.error)
    return <Failure error={query.error} retry={() => void query.refetch()} />;
  return (
    <section>
      <div className="page-heading">
        <div>
          <Link className="back-link" to="/extensions">
            Installed extensions
          </Link>
          <h1>Extension operation</h1>
          <p className="muted">
            {query.data.pluginID} · {query.data.id}
          </p>
        </div>
        <button
          className="button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh
        </button>
      </div>
      <dl className="detail-grid">
        <div>
          <dt>Status</dt>
          <dd role="status">{query.data.status}</dd>
        </div>
        <div>
          <dt>Phase</dt>
          <dd>{query.data.phase}</dd>
        </div>
        <div>
          <dt>Generation</dt>
          <dd>{query.data.generation}</dd>
        </div>
      </dl>
      {query.data.condition ? (
        <p
          role={
            query.data.status === "blocked" || query.data.status === "failed"
              ? "alert"
              : "status"
          }
          className="state mt-4"
        >
          {query.data.condition}
        </p>
      ) : null}
      <p className="muted mt-4">{extensionDescription(query.data.status)}</p>
    </section>
  );
}
function extensionDescription(status: string) {
  switch (status) {
    case "pending":
      return "Waiting for the controller. Requested availability has not been confirmed.";
    case "running":
      return "The controller is processing this availability change.";
    case "blocked":
      return "This operation is blocked. Review its condition and dependencies before requesting another change.";
    case "failed":
      return "The operation failed. Refresh the installation state before deciding what to do next.";
    case "succeeded":
      return "The controller recorded completion. Deployed processes and stored data are retained by availability changes.";
    default:
      return "Operation state is unavailable.";
  }
}
