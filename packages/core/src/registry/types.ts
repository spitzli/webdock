// Public registry DTOs: credential, reset-token and native-session columns are excluded.
export interface User {
  id: string;
  authSubject?: string | null;
  name: string;
  role: "operator" | "admin" | "editor" | "reader";
  updatedAt: string;
  createdAt: string;
  email: string;
  collection: "users";
}
export interface Customer {
  id: string;
  name: string;
  customerType?: ("person" | "company") | null;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
  status: "active" | "archived";
  updatedAt: string;
  createdAt: string;
}
export interface Project {
  id: string;
  name: string;
  customer: string | Customer;
  url?: string | null;
  repositoryURL?: string | null;
  notes?: string | null;
  status: "active" | "archived";
  updatedAt: string;
  createdAt: string;
}
export interface CmsInstance {
  id: string;
  label: string;
  project: string | Project;
  adminURL: string;
  schemaName: string;
  provider: "vercel" | "other";
  providerProjectID: string;
  template:
    "webdock-landing" | "spitzli-portfolio" | "stall-business" | "custom";
  payloadVersion?: string | null;
  status: "active" | "suspended" | "retired";
  notes?: string | null;
  updatedAt: string;
  createdAt: string;
}
export interface AuditEvent {
  id: string;
  actor: string | User;
  action: "create" | "update";
  targetCollection: string;
  targetID: string;
  summary: string;
  changedFields?: string | null;
  updatedAt: string;
  createdAt: string;
}
export type RegistryWhere = {
  and?: RegistryWhere[];
  or?: RegistryWhere[];
  [field: string]: unknown;
};
