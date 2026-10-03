import Link from "next/link";
import { redirect } from "next/navigation";
import type { Where } from "payload";
import { requireOperator } from "../../../../lib/server";
import {
  listQuery,
  listURL,
  queryText,
  type SearchParams,
} from "../../../../lib/list-query";
import { ListControls, Pagination } from "../../../../components/list-controls";
export default async function Activity({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { payload, user } = await requireOperator();
  const params = await searchParams;
  const query = listQuery(params, "-createdAt");
  const sort = query.sort === "createdAt" ? "createdAt" : "-createdAt";
  const collection = ["projects", "customers", "cms-instances"].includes(
    queryText(params.collection),
  )
    ? queryText(params.collection)
    : "";
  const target = queryText(params.target);
  const action = ["create", "update"].includes(queryText(params.action))
    ? queryText(params.action)
    : "";
  const where: Where = {
    and: [
      ...(query.q
        ? [
            {
              or: [
                { summary: { contains: query.q } },
                { changedFields: { contains: query.q } },
              ],
            },
          ]
        : []),
      ...(collection ? [{ targetCollection: { equals: collection } }] : []),
      ...(target ? [{ targetID: { equals: target } }] : []),
      ...(action ? [{ action: { equals: action } }] : []),
    ],
  };
  const events = await payload.find({
    collection: "audit-events",
    where,
    page: query.page,
    limit: 30,
    depth: 1,
    sort,
    user,
    overrideAccess: false,
  });
  const filters = { q: query.q, sort, collection, action, target };
  if (query.page > Math.max(1, events.totalPages))
    redirect(
      listURL("/activity", {
        ...filters,
        page: Math.max(1, events.totalPages),
      }),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Activity</h1>
          <p>A lasting record of who changed what in your workspace.</p>
        </div>
      </div>
      <ListControls
        path="/activity"
        q={query.q}
        sort={sort}
        placeholder="Change summary or field"
        activity
        extra={
          <>
            <div>
              <label htmlFor="collection">Record type</label>
              <select
                id="collection"
                name="collection"
                defaultValue={collection}
              >
                <option value="">All records</option>
                <option value="projects">Projects</option>
                <option value="customers">Customers</option>
                <option value="cms-instances">CMS connections</option>
              </select>
            </div>
            <div>
              <label htmlFor="action">Change</label>
              <select id="action" name="action" defaultValue={action}>
                <option value="">All changes</option>
                <option value="create">Created</option>
                <option value="update">Updated</option>
              </select>
            </div>
            {target && <input name="target" type="hidden" value={target} />}
          </>
        }
      />
      {target && (
        <p className="filter-context">
          History for record <code>{target}</code>.{" "}
          <Link href={listURL("/activity", { ...filters, target: "" })}>
            Show all records
          </Link>
        </p>
      )}
      <section className="panel activity-list" aria-label="Recorded changes">
        {events.docs.map((e) => (
          <div className="activity-row" key={e.id}>
            <span className="activity-marker" aria-hidden="true">
              {e.action === "create" ? "+" : "↺"}
            </span>
            <div className="activity-content">
              <strong>{e.summary}</strong>
              <small>
                {typeof e.actor === "object" ? e.actor.name : "Operator"}
                {e.changedFields ? " · " + e.changedFields : ""}
              </small>
              {["customers", "projects"].includes(e.targetCollection) && (
                <Link
                  className="activity-target"
                  href={"/" + e.targetCollection + "/" + e.targetID}
                >
                  View{" "}
                  {e.targetCollection === "projects" ? "project" : "customer"}
                </Link>
              )}
            </div>
            <time dateTime={e.createdAt}>
              {new Intl.DateTimeFormat("en", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "UTC",
              }).format(new Date(e.createdAt))}
              <small>UTC</small>
            </time>
          </div>
        ))}
        {!events.totalDocs && (
          <div className="empty">
            <h2>
              {query.q || collection || action || target
                ? "No matching changes"
                : "No changes yet"}
            </h2>
            <p>
              {query.q || collection || action || target
                ? "Broaden your filters to see more workspace activity."
                : "Customer, project and CMS updates will appear here with their author and time."}
            </p>
            {(query.q || collection || action || target) && (
              <Link className="button secondary" href="/activity">
                Reset filters
              </Link>
            )}
          </div>
        )}
      </section>
      <Pagination
        path="/activity"
        query={filters}
        page={query.page}
        totalPages={events.totalPages}
        totalDocs={events.totalDocs}
        limit={30}
      />
    </>
  );
}
