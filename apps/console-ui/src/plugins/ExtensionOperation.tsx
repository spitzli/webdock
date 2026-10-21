import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi, useSession } from "../context";
import { Empty, Failure, Loading } from "../common";
import { extensionOperation, extensionPolling } from "./lifecycle-contracts";
import { backLink } from "../ui";
import * as ui from "../ui";
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
      <div className={ui.pageHeading}>
        <div>
          <Link className={backLink} to="/extensions">
            Installed extensions
          </Link>
          <h1 className={ui.pageTitle}>Extension operation</h1>
          <p className={ui.pageLead}>
            {query.data.pluginID} · <span className={ui.mono}>{query.data.id}</span>
          </p>
        </div>
        <button
          className={ui.button()}
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh
        </button>
      </div>
      <div className={ui.card}>
      <dl className={ui.cx(`${ui.cardBody} sm:grid-cols-3`)}>
        <div>
          <dt className="text-xs text-muted">Status</dt>
          <dd className="mt-1 text-sm font-medium" role="status">{query.data.status}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Phase</dt>
          <dd className="mt-1 text-sm">{query.data.phase}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Generation</dt>
          <dd className="mt-1 text-sm">{query.data.generation}</dd>
        </div>
      </dl>
      {query.data.condition ? (
        <p
          role={
            query.data.status === "blocked" || query.data.status === "failed"
              ? "alert"
              : "status"
          }
          className={ui.cx(`${ui.cardRow} block`)}
        >
          {query.data.condition}
        </p>
      ) : null}
      <p className={ui.cardFooter}>{extensionDescription(query.data.status)}</p>
      </div>
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
