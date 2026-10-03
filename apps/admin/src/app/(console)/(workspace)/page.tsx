import Link from "next/link";
import { redirect } from "next/navigation";
import type { Where } from "payload";
import { requireOperator } from "../../../lib/server";
import {
  relatedID,
  date,
  hostname,
  validRecordID,
} from "../../../lib/presentation";
import {
  listQuery,
  listURL,
  queryText,
  type SearchParams,
} from "../../../lib/list-query";
import { ListControls, Pagination } from "../../../components/list-controls";
export default async function Projects({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { payload, user } = await requireOperator();
  const params = await searchParams;
  const query = listQuery(params);
  const rawCustomer = queryText(params.customer);
  const customer = validRecordID(rawCustomer) ? rawCustomer : "";
  const where: Where = {
    and: [
      ...(query.status === "all" ? [] : [{ status: { equals: query.status } }]),
      ...(customer ? [{ customer: { equals: customer } }] : []),
      ...(query.q
        ? [
            {
              or: [
                { name: { contains: query.q } },
                { url: { contains: query.q } },
                { "customer.name": { contains: query.q } },
              ],
            },
          ]
        : []),
    ],
  };
  const [projects, active, archived, cmsCount] = await Promise.all([
    payload.find({
      collection: "projects",
      where,
      limit: 20,
      page: query.page,
      depth: 1,
      user,
      overrideAccess: false,
      sort: query.sort,
    }),
    payload.count({
      collection: "projects",
      where: { status: { equals: "active" } },
      user,
      overrideAccess: false,
    }),
    payload.count({
      collection: "projects",
      where: { status: { equals: "archived" } },
      user,
      overrideAccess: false,
    }),
    payload.count({
      collection: "cms-instances",
      where: { status: { equals: "active" } },
      user,
      overrideAccess: false,
    }),
  ]);
  if (query.page > Math.max(1, projects.totalPages))
    redirect(
      listURL("/", {
        ...query,
        customer,
        page: Math.max(1, projects.totalPages),
      }),
    );
  const instances = projects.docs.length
    ? await payload.find({
        collection: "cms-instances",
        where: { project: { in: projects.docs.map((p) => p.id) } },
        pagination: false,
        depth: 0,
        user,
        overrideAccess: false,
      })
    : { docs: [] };
  const cms = new Map(instances.docs.map((i) => [relatedID(i.project), i]));
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Projects</h1>
          <p>Websites, customers and content systems, in one place.</p>
        </div>
        <Link className="button" href="/projects/new">
          New project +
        </Link>
      </div>
      <div className="overview-line">
        <Link href="/?status=active">
          <strong>{active.totalDocs}</strong> Active projects
        </Link>
        <Link href="/?status=archived">
          <strong>{archived.totalDocs}</strong> Archived projects
        </Link>
        <span>
          <strong>{cmsCount.totalDocs}</strong> Active CMS records
        </span>
      </div>
      <ListControls
        path="/"
        q={query.q}
        status={query.status}
        sort={query.sort}
        placeholder="Project, customer or domain"
        extra={
          customer ? (
            <input type="hidden" name="customer" value={customer} />
          ) : undefined
        }
      />
      {customer && (
        <p className="filter-context">
          Showing projects for one customer.{" "}
          <Link href={listURL("/", { ...query, page: 1 })}>
            Show all customers
          </Link>
        </p>
      )}
      <div className="table-wrap">
        <table className="records-table" role="table">
          <caption className="sr-only">
            Projects matching the selected filters
          </caption>
          <thead>
            <tr>
              <th scope="col">Project</th>
              <th scope="col">Customer</th>
              <th scope="col">CMS record</th>
              <th scope="col">Updated</th>
              <th scope="col">
                <span className="sr-only">Manage</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.docs.map((project) => (
              <tr key={project.id}>
                <td data-label="Project">
                  <Link
                    className="project-name"
                    href={"/projects/" + project.id}
                  >
                    {project.name}
                  </Link>
                  <small>
                    {hostname(project.url)}
                    {project.status === "archived" && " · Archived"}
                  </small>
                </td>
                <td data-label="Customer">
                  <Link href={"/customers/" + relatedID(project.customer)}>
                    {typeof project.customer === "object"
                      ? project.customer.name
                      : "Customer"}
                  </Link>
                </td>
                <td data-label="CMS record">
                  <span
                    className={
                      "badge " +
                      (cms.get(project.id)?.status === "active"
                        ? "connected"
                        : "")
                    }
                  >
                    {cms.get(project.id)?.status || "Not linked"}
                  </span>
                </td>
                <td className="muted" data-label="Updated">
                  <time dateTime={project.updatedAt}>
                    {date(project.updatedAt)}
                  </time>
                </td>
                <td data-label="Manage">
                  <Link
                    className="row-link"
                    href={"/projects/" + project.id}
                    aria-label={"Manage " + project.name}
                  >
                    ↗
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!projects.totalDocs && (
          <div className="empty">
            <h3>
              {query.q || customer
                ? "No matching projects"
                : query.status === "archived"
                  ? "No archived projects"
                  : "Make room for your next project"}
            </h3>
            <p>
              {query.q || customer
                ? "Try a different name or domain, or reset your filters."
                : "Add a customer and a project to keep its website and CMS details together."}
            </p>
            <Link
              className="button secondary"
              href={query.q || customer ? "/" : "/projects/new"}
            >
              {query.q || customer ? "Reset filters" : "Create a project"}
            </Link>
          </div>
        )}
      </div>
      <Pagination
        path="/"
        query={{ ...query, customer }}
        page={query.page}
        totalPages={projects.totalPages}
        totalDocs={projects.totalDocs}
        limit={20}
      />
      <aside className="note">
        <span className="note-mark" aria-hidden="true">
          ↳
        </span>
        <div>
          <h3>Independent websites. A shared workspace.</h3>
          <p>
            Each project keeps its own design and content. CMS statuses are
            recorded inventory, not live health checks. Link a deployed CMS when
            your project needs one.
          </p>
        </div>
      </aside>
    </>
  );
}
