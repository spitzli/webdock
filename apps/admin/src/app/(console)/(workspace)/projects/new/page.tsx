import Link from "next/link";
import { Editor } from "../../../../../components/editor";
import { saveProject } from "../../../../../lib/actions";
import { requireOperator } from "../../../../../lib/server";
export default async function NewProject({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { payload, user } = await requireOperator();
  const q = await searchParams;
  const customers = await payload.find({
    collection: "customers",
    where: { status: { equals: "active" } },
    limit: 1000,
    sort: "name",
    overrideAccess: false,
    user,
  });
  return (
    <>
      <Link className="back" href="/">
        ← Projects
      </Link>
      <div className="page-heading">
        <div>
          <h1>New project</h1>
          <p>
            Start with the essentials. No CMS will be created automatically.
          </p>
        </div>
      </div>
      <section className="panel">
        {customers.totalDocs ? (
          <Editor
            action={saveProject.bind(null, null)}
            submit="Create project"
            fields={[
              { name: "name", label: "Project name", required: true },
              {
                name: "customer",
                label: "Customer",
                type: "select",
                required: true,
                value: q.customer,
                options: [
                  { value: "", label: "Choose a customer" },
                  ...customers.docs.map((c) => ({
                    value: c.id,
                    label: c.name,
                  })),
                ],
              },
              { name: "url", label: "Website URL", type: "url" },
              { name: "repositoryURL", label: "Repository URL", type: "url" },
              { name: "notes", label: "Notes", type: "textarea" },
            ]}
          />
        ) : (
          <div className="empty">
            <h2>Add a customer first.</h2>
            <Link className="button" href="/customers/new">
              Create customer
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
