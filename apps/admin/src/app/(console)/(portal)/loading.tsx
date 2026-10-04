export default function PortalLoading() {
  return (
    <div
      className="loading-view"
      role="status"
      aria-label="Loading your workspace"
    >
      <div className="loading-line" aria-hidden="true" />
      <div className="loading-line short" aria-hidden="true" />
      <p>Loading your workspace…</p>
      <div className="portal-loading-grid" aria-hidden="true">
        <div />
        <div />
      </div>
    </div>
  );
}
