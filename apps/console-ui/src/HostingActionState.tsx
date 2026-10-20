import { ApiError } from "./api";
export function ActionFailure({
  error,
  uncertain,
  retry,
  pending,
}: {
  error: Error | null;
  uncertain: boolean;
  retry: () => void;
  pending: boolean;
}) {
  if (!error) return null;
  return (
    <div className="state error mt-4" role="alert">
      <div>
        <h2>
          {uncertain
            ? "Request outcome is unknown"
            : "Request was not accepted"}
        </h2>
        <p>{error.message}</p>
        {error instanceof ApiError && error.status === 409 ? (
          <p>
            Refresh and review the current revision and operation before
            requesting another change.
          </p>
        ) : null}
        {uncertain ? (
          <>
            <p>
              Review the current server state. Retrying here sends the same
              request with the same identity; it does not create a new action.
            </p>
            <button
              type="button"
              className="button"
              onClick={retry}
              disabled={pending}
            >
              {pending ? "Checking…" : "Retry same request"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
