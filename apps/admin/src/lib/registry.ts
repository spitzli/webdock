import { APIError, type Payload, type Where } from "payload";
import { z } from "zod";
import type { User } from "../payload-types";

export type RegistryActor = { payload: Payload; user: User & { collection: "users" } };
export const recordID = z.string().regex(/^[1-9][0-9]{0,18}$/).refine(v => /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n, "Invalid ID");
export const collectionName = z.enum(["customers", "projects", "cms-instances", "audit-events"]);
const text = z.string().trim().max(160);
const optionalText = text.nullable().optional();
const notes = z.string().trim().max(3000).nullable().optional();
const url = z.string().url().refine(v => { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password; }, "Use an HTTPS URL without credentials").nullable().optional();
export const customerInput = z.object({
  name: text.min(1),
  customerType: z.enum(["person", "company"]).optional(),
  firstName: optionalText,
  lastName: optionalText,
  companyName: optionalText,
  contactName: optionalText,
  contactEmail: z.string().trim().max(254).email().nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  addressLine1: optionalText,
  addressLine2: optionalText,
  postalCode: z.string().trim().max(32).nullable().optional(),
  city: optionalText,
  region: optionalText,
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a two-letter ISO country code").nullable().optional(),
  notes,
}).strict();
export const projectInput = z.object({ name: text.min(1), customer: recordID, url, repositoryURL: url, notes }).strict();
export const instanceInput = z.object({ project: recordID, label: text.min(1), adminURL: url.unwrap().unwrap(), schemaName: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/), providerProjectID: text.min(1), provider: z.enum(["vercel", "other"]), template: z.enum(["webdock-landing", "spitzli-portfolio", "stall-business", "custom"]), payloadVersion: z.string().max(64).nullable().optional(), status: z.enum(["active", "suspended", "retired"]), notes }).strict();
function authorize(actor: RegistryActor) {
  if (!actor.user || actor.user.collection !== "users" || actor.user.role !== "operator") throw new APIError("An operator is required.", 403);
}
export async function writeCustomer(actor: RegistryActor, id: string | null, input: unknown) {
  authorize(actor);
  const data = customerInput.parse(input);
  return id ? actor.payload.update({ collection: "customers", id: recordID.parse(id), data, user: actor.user, overrideAccess: false }) : actor.payload.create({ collection: "customers", data: { ...data, customerType: data.customerType ?? "company", status: "active" }, user: actor.user, overrideAccess: false });
}
export async function writeProject(actor: RegistryActor, id: string | null, input: unknown) {
  authorize(actor);
  const data = projectInput.parse(input);
  return id ? actor.payload.update({ collection: "projects", id: recordID.parse(id), data, user: actor.user, overrideAccess: false }) : actor.payload.create({ collection: "projects", data: { ...data, status: "active" }, user: actor.user, overrideAccess: false });
}
export async function writeInstance(actor: RegistryActor, id: string | null, input: unknown, confirmExisting: boolean) {
  authorize(actor);
  if (!id && !confirmExisting) throw new APIError("Confirm that this CMS is already deployed.", 400);
  const data = instanceInput.parse(input);
  return id ? actor.payload.update({ collection: "cms-instances", id: recordID.parse(id), data, user: actor.user, overrideAccess: false }) : actor.payload.create({ collection: "cms-instances", data, user: actor.user, overrideAccess: false });
}
export async function setArchived(actor: RegistryActor, collection: "customers" | "projects", id: string, archived: boolean) {
  authorize(actor);
  if (collection !== "customers" && collection !== "projects") throw new APIError("Invalid collection.", 400);
  return actor.payload.update({ collection, id: recordID.parse(id), data: { status: archived ? "archived" : "active" }, user: actor.user, overrideAccess: false });
}
export const listInput = z.object({ collection: collectionName, search: z.string().trim().max(160).optional(), page: z.number().int().min(1).max(10000).default(1), limit: z.number().int().min(1).max(50).default(20), status: z.enum(["active", "archived", "suspended", "retired"]).optional(), customer: recordID.optional(), project: recordID.optional(), targetCollection: z.enum(["customers", "projects", "cms-instances"]).optional(), targetID: recordID.optional(), sort: z.enum(["name", "-name", "label", "-label", "-updatedAt", "-createdAt", "createdAt"]).default("-updatedAt") }).strict();
export async function listRecords(actor: RegistryActor, input: z.input<typeof listInput>) {
  authorize(actor);
  const { collection, search, page, limit, status, customer, project, targetCollection, targetID, sort } = listInput.parse(input);
  if ((customer && collection !== "projects") || (project && collection !== "cms-instances") || ((targetCollection || targetID) && collection !== "audit-events") || (sort.includes("name") && !["customers", "projects"].includes(collection)) || (sort.includes("label") && collection !== "cms-instances")) throw new APIError("Filter or sort is not available for this collection.", 400);
  if (status && (collection === "audit-events" || !(collection === "cms-instances" ? ["active", "suspended", "retired"] : ["active", "archived"]).includes(status))) throw new APIError("Invalid status for this collection.", 400);
  const and: Where[] = [];
  for (const [field, value] of Object.entries({ customer, project, targetCollection, targetID })) if (value) and.push({ [field]: { equals: value } });
  if (search) and.push({ [collection === "audit-events" ? "summary" : collection === "cms-instances" ? "label" : "name"]: { contains: search } });
  if (status && collection !== "audit-events") and.push({ status: { equals: status } });
  const result = await actor.payload.find({ collection, where: and.length ? { and } : undefined, page, limit, depth: 0, sort, user: actor.user, overrideAccess: false });
  return { docs: result.docs, page: result.page, totalPages: result.totalPages, totalDocs: result.totalDocs };
}
export async function getRecord(actor: RegistryActor, collection: z.infer<typeof collectionName>, id: string) {
  authorize(actor);
  return actor.payload.findByID({ collection: collectionName.parse(collection), id: recordID.parse(id), depth: 0, user: actor.user, overrideAccess: false });
}
