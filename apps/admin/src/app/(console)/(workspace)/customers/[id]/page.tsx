import Link from "next/link";
import { notFound } from "next/navigation";
import { Editor, ArchiveButton } from "../../../../../components/editor";
import { saveCustomer, archiveRecord } from "../../../../../lib/actions";
import { requireOperator } from "../../../../../lib/server";
export default async function Customer({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { payload, user } = await requireOperator();
  const customer = await payload.findByID({
    collection: "customers",
    id,
    overrideAccess: false,
    user,
    disableErrors: true,
  });
  if (!customer) notFound();
  const projects = await payload.find({
    collection: "projects",
    where: { customer: { equals: id } },
    limit: 100,
    user,
    overrideAccess: false,
    depth: 0,
  });
  return (
    <>
      <Link className="back" href="/customers">
        ← Customers
      </Link>
      <div className="page-heading">
        <div>
          <h1>{customer.name}</h1>
          <p>
            <span className="badge">{customer.status}</span>
          </p>
        </div>
        {customer.status === "active" && (
          <Link href={"/projects/new?customer=" + id} className="button">
            Add project +
          </Link>
        )}
      </div>
      <div className="detail-grid">
        <section className="panel">
          <h2>Customer details</h2>
          <Editor
            action={saveCustomer.bind(null, id)}
            fields={[
              {
                name: "name",
                label: "Customer name",
                required: true,
                value: customer.name,
              },
              {
                name: "contactName",
                label: "Contact person",
                value: customer.contactName || "",
              },
              {
                name: "contactEmail",
                label: "Contact email",
                type: "email",
                value: customer.contactEmail || "",
              },
              {
                name: "notes",
                label: "Notes",
                type: "textarea",
                value: customer.notes || "",
              },
            ]}
          />
        </section>
        <aside>
          <section className="panel">
            <h2>Projects</h2>
            {projects.docs.map((p) => (
              <Link
                className="related-project"
                key={p.id}
                href={"/projects/" + p.id}
              >
                {p.name}
                <span>↗</span>
              </Link>
            ))}
            {!projects.totalDocs && <p className="muted">No projects yet.</p>}
          </section>
          <section className="record-meta">
            <p>
              Customer ID <code>{id}</code>
            </p>
            <ArchiveButton
              action={archiveRecord.bind(null, "customers", id)}
              archived={customer.status === "archived"}
            />
          </section>
        </aside>
      </div>
    </>
  );
}
