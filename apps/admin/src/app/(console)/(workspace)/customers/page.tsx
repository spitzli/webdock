import Link from "next/link";
import { requireOperator } from "../../../../lib/server";
export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const { payload, user } = await requireOperator();
  const q = await searchParams;
  const page = Math.max(1, Number.parseInt(q.page || "1") || 1);
  const archived = q.status === "archived";
  const customers = await payload.find({
    collection: "customers",
    where: { status: { equals: archived ? "archived" : "active" } },
    page,
    limit: 25,
    sort: "name",
    overrideAccess: false,
    user,
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Customers</h1>
          <p>The people and organisations behind your projects.</p>
        </div>
        <Link className="button" href="/customers/new">
          New customer +
        </Link>
      </div>
      <div className="section-heading">
        <h2>
          {customers.totalDocs} {archived ? "archived" : "active"} customers
        </h2>
        <div className="tabs">
          <Link href="/customers" aria-current={!archived ? "page" : undefined}>
            Active
          </Link>
          <Link
            href="/customers?status=archived"
            aria-current={archived ? "page" : undefined}
          >
            Archived
          </Link>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Contact</th>
              <th>Email</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {customers.docs.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link className="project-name" href={"/customers/" + c.id}>
                    {c.name}
                  </Link>
                </td>
                <td>{c.contactName || "—"}</td>
                <td>{c.contactEmail || "—"}</td>
                <td>
                  <Link
                    className="row-link"
                    aria-label={"Manage " + c.name}
                    href={"/customers/" + c.id}
                  >
                    ↗
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!customers.totalDocs && (
          <div className="empty">
            <h3>No customers yet.</h3>
            <p>Add your first customer to start organising projects.</p>
          </div>
        )}
      </div>
      <div className="pagination">
        {customers.hasPrevPage && (
          <Link
            href={`?page=${page - 1}&status=${archived ? "archived" : "active"}`}
          >
            Previous
          </Link>
        )}
        <span>
          Page {page} of {Math.max(1, customers.totalPages)}
        </span>
        {customers.hasNextPage && (
          <Link
            href={`?page=${page + 1}&status=${archived ? "archived" : "active"}`}
          >
            Next
          </Link>
        )}
      </div>
    </>
  );
}
