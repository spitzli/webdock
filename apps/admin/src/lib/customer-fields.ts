import type { EditorField } from "../components/editor";
import type { Customer } from "../payload-types";

export function customerFields(customer?: Customer): EditorField[] {
  const fields: EditorField[] = [
    { name: "name", label: "Customer display name", required: true, group: "Customer profile" },
    { name: "customerType", label: "Customer type", type: "select", value: "company", options: [{ value: "company", label: "Company" }, { value: "person", label: "Person" }] },
    { name: "companyName", label: "Company name", hint: "For business customers." },
    { name: "firstName", label: "First name", hint: "For personal customers or the primary contact." },
    { name: "lastName", label: "Last name" },
    { name: "contactName", label: "Contact person", group: "Contact details" },
    { name: "contactEmail", label: "Contact email", type: "email", maxLength: 254, hint: "A contact address does not grant access. Invite members from Tenant & invitations after saving." },
    { name: "phone", label: "Phone", type: "tel", maxLength: 50 },
    { name: "addressLine1", label: "Street and number", group: "Postal address" },
    { name: "addressLine2", label: "Address addition" },
    { name: "postalCode", label: "Postal code", maxLength: 32 },
    { name: "city", label: "City" },
    { name: "region", label: "State / region" },
    { name: "country", label: "Country code", maxLength: 2, hint: "Two-letter ISO code, for example DE or CH." },
    { name: "notes", label: "Private operator notes", type: "textarea", group: "Internal", hint: "Only operators can see these notes." },
  ];
  return fields.map(field => ({ ...field, value: customer?.[field.name as keyof Customer] ?? field.value ?? "" }));
}
