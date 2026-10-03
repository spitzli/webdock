import Link from "next/link";
import { requireOperator } from "../../../../lib/server";
import { date } from "../../../../lib/presentation";
export default async function Activity({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { payload, user } = await requireOperator();
  const q = await searchParams;
  const page = Math.max(1, Number.parseInt(q.page || "1") || 1);
  const events = await payload.find({
    collection: "audit-events",
    page,
    limit: 30,
    depth: 1,
    sort: "-createdAt",
    user,
    overrideAccess: false,
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Activity</h1>
          <p>A lasting record of changes to your workspace.</p>
        </div>
      </div>
      <section className="panel">
        {events.docs.map((e) => (
          <div className="activity-row" key={e.id}>
            <div>
              <strong>{e.summary}</strong>
              <small>
                {typeof e.actor === "object" ? e.actor.name : "Operator"}
                {e.changedFields ? " · " + e.changedFields : ""}
              </small>
            </div>
            <time dateTime={e.createdAt}>{date(e.createdAt)}</time>
          </div>
        ))}
        {!events.totalDocs && (
          <div className="empty">
            <h2>No changes yet.</h2>
            <p>New customers and project updates will appear here.</p>
          </div>
        )}
      </section>
      <div className="pagination">
        {events.hasPrevPage && (
          <Link href={"?page=" + (page - 1)}>Previous</Link>
        )}
        <span>
          Page {page} of {Math.max(1, events.totalPages)}
        </span>
        {events.hasNextPage && <Link href={"?page=" + (page + 1)}>Next</Link>}
      </div>
    </>
  );
}
