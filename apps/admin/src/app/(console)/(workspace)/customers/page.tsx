import Link from "next/link";
import { redirect } from "next/navigation";
import type { Where } from "payload";
import { requireOperator } from "../../../../lib/server";
import { date } from "../../../../lib/presentation";
import {
  listQuery,
  listURL,
  type SearchParams,
} from "../../../../lib/list-query";
import { ListControls, Pagination } from "../../../../components/list-controls";
export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { payload, user } = await requireOperator();
  const query = listQuery(await searchParams, "name");
  const where: Where = {
    and: [
      ...(query.status === "all" ? [] : [{ status: { equals: query.status } }]),
      ...(query.q
        ? [
            {
              or: [
                { name: { contains: query.q } },
                { firstName: { contains: query.q } },
                { lastName: { contains: query.q } },
                { companyName: { contains: query.q } },
                { contactName: { contains: query.q } },
                { contactEmail: { contains: query.q } },
              ],
            },
          ]
        : []),
    ],
  };
  const customers = await payload.find({
    collection: "customers",
    where,
    page: query.page,
    limit: 20,
    sort: query.sort,
    overrideAccess: false,
    user,
  });
  if (query.page > Math.max(1, customers.totalPages))
    redirect(
      listURL("/customers", {
        ...query,
        page: Math.max(1, customers.totalPages),
      }),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Customers</h1>
          <p>Each customer has a tenant for their projects, with access by invitation.</p>
        </div>
        <Link className="button" href="/customers/new">
          New customer +
        </Link>
      </div>
      <ListControls
        path="/customers"
        q={query.q}
        status={query.status}
        sort={query.sort}
        placeholder="Name, contact or email"
      />
      <div className="table-wrap">
        <table className="records-table" role="table">
          <caption className="sr-only">
            Customers matching the selected filters
          </caption>
          <thead>
            <tr>
              <th scope="col">Customer</th>
              <th scope="col">Contact</th>
              <th scope="col">Status</th>
              <th scope="col">Updated</th>
              <th scope="col">
                <span className="sr-only">Manage</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {customers.docs.map((c) => (
              <tr key={c.id}>
                <td data-label="Customer">
                  <Link className="project-name" href={"/customers/" + c.id}>
                    {c.name}
                  </Link>
                  <small>{c.customerType === "person" ? "Person" : "Company"} · Tenant</small>
                </td>
                <td data-label="Contact">
                  {c.contactName || "No contact person"}
                  <small>
                    {c.contactEmail ? (
                      <a href={"mailto:" + c.contactEmail}>{c.contactEmail}</a>
                    ) : (
                      "No email recorded"
                    )}
                  </small>
                </td>
                <td data-label="Status">
                  <span
                    className={
                      "badge " + (c.status === "active" ? "connected" : "")
                    }
                  >
                    {c.status}
                  </span>
                </td>
                <td className="muted" data-label="Updated">{date(c.updatedAt)}</td>
                <td data-label="Manage">
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
            <h3>
              {query.q
                ? "No matching customers"
                : query.status === "archived"
                  ? "No archived customers"
                  : "Your first customer starts here"}
            </h3>
            <p>
              {query.q
                ? "Try another name, contact or email address."
                : "Customer records keep contact details and related projects together."}
            </p>
            <Link
              className="button secondary"
              href={query.q ? "/customers" : "/customers/new"}
            >
              {query.q ? "Reset filters" : "Create a customer"}
            </Link>
          </div>
        )}
      </div>
      <Pagination
        path="/customers"
        query={query}
        page={query.page}
        totalPages={customers.totalPages}
        totalDocs={customers.totalDocs}
        limit={20}
      />
    </>
  );
}
