import { customerFields } from "../../../../../lib/customer-fields";
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
            Each customer gets a tenant for their projects. Access is invite-only; add members after creating the customer.
          </p>
        </div>
      </div>
      <section className="panel">
        <Editor
          action={saveCustomer.bind(null, null)}
          submit="Create customer"
          fields={customerFields()}
        />
      </section>
    </>
  );
}
