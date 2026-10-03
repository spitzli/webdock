export default function Loading() {
  return (
    <div className="loading-view" role="status">
      <div className="loading-line" />
      <div className="loading-line short" />
      <p>Loading workspace…</p>
    </div>
  );
}
