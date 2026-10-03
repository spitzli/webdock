import Link from "next/link";
import { requireOperator } from "../../../lib/server";
import { relatedID, date, hostname } from "../../../lib/presentation";
export default async function Projects({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const { payload, user } = await requireOperator();
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page || "1") || 1);
  const archived = query.status === "archived";
  const [projects, customers, instances] = await Promise.all([
    payload.find({
      collection: "projects",
      where: { status: { equals: archived ? "archived" : "active" } },
      limit: 25,
      page,
      depth: 1,
      user,
      overrideAccess: false,
      sort: "-updatedAt",
    }),
    payload.count({
      collection: "customers",
      where: { status: { equals: "active" } },
      user,
      overrideAccess: false,
    }),
    payload.find({
      collection: "cms-instances",
      limit: 1000,
      depth: 0,
      user,
      overrideAccess: false,
    }),
  ]);
  const cms = new Map(instances.docs.map((i) => [relatedID(i.project), i]));
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Projects</h1>
          <p>A clear view of what you’re building and managing.</p>
        </div>
        <Link className="button" href="/projects/new">
          New project <span>+</span>
        </Link>
      </div>
      <div className="overview-line">
        <span>
          <strong>{projects.totalDocs}</strong>{" "}
          {archived ? "archived" : "active"} projects
        </span>
        <span>
          <strong>{customers.totalDocs}</strong> customers
        </span>
        <span>
          <strong>
            {instances.docs.filter((i) => i.status === "active").length}
          </strong>{" "}
          CMS connections
        </span>
      </div>
      <div className="section-heading">
        <h2>Your workspace</h2>
        <div className="tabs">
          <Link aria-current={!archived ? "page" : undefined} href="/">
            Active
          </Link>
          <Link
            aria-current={archived ? "page" : undefined}
            href="/?status=archived"
          >
            Archived
          </Link>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Customer</th>
              <th>CMS</th>
              <th>Updated</th>
              <th>
                <span className="sr-only">Manage</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.docs.map((project) => (
              <tr key={project.id}>
                <td>
                  <Link
                    className="project-name"
                    href={"/projects/" + project.id}
                  >
                    {project.name}
                  </Link>
                  <small>{hostname(project.url)}</small>
                </td>
                <td>
                  {typeof project.customer === "object"
                    ? project.customer.name
                    : "Customer"}
                </td>
                <td>
                  <span
                    className={
                      "badge " +
                      (cms.get(project.id)?.status === "active"
                        ? "connected"
                        : "")
                    }
                  >
                    {cms.has(project.id)
                      ? cms.get(project.id)?.status === "active"
                        ? "Connected"
                        : cms.get(project.id)?.status
                      : "Not enabled"}
                  </span>
                </td>
                <td className="muted">{date(project.updatedAt)}</td>
                <td>
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
        {projects.totalDocs === 0 && (
          <div className="empty">
            <h3>
              {archived
                ? "No archived projects."
                : "Your next project starts here."}
            </h3>
            <p>
              Create a customer, then add a project. A CMS is always optional.
            </p>
            <Link href="/customers/new">Add a customer</Link>
          </div>
        )}
      </div>
      <div className="pagination">
        {projects.hasPrevPage && (
          <Link
            href={`/?page=${page - 1}&status=${archived ? "archived" : "active"}`}
          >
            Previous
          </Link>
        )}
        <span>
          Page {page} of {Math.max(1, projects.totalPages)}
        </span>
        {projects.hasNextPage && (
          <Link
            href={`/?page=${page + 1}&status=${archived ? "archived" : "active"}`}
          >
            Next
          </Link>
        )}
      </div>
      <aside className="note">
        <span className="note-mark">↳</span>
        <div>
          <h3>Each project gets its own space.</h3>
          <p>
            Websites keep their own design, content and admin. Adding a project
            here doesn’t automatically create a CMS.
          </p>
        </div>
      </aside>
    </>
  );
}
