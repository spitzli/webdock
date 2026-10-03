import Link from "next/link";
import { Editor } from "../../../../../components/editor";
import { saveCustomer } from "../../../../../lib/actions";
export default function NewCustomer() {
  return (
    <>
      <Link className="back" href="/customers">
        ← Customers
      </Link>
      <div className="page-heading">
        <div>
          <h1>New customer</h1>
          <p>
            A customer can have any number of projects, with or without a CMS.
          </p>
        </div>
      </div>
      <section className="panel">
        <Editor
          action={saveCustomer.bind(null, null)}
          submit="Create customer"
          fields={[
            { name: "name", label: "Customer name", required: true },
            { name: "contactName", label: "Contact person" },
            { name: "contactEmail", label: "Contact email", type: "email" },
            { name: "notes", label: "Notes", type: "textarea" },
          ]}
        />
      </section>
    </>
  );
}
