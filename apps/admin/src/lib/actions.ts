"use server";
import { APIError } from "payload";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOperator } from "./server";
export type FormState = { error?: string; values?: Record<string, string> };
const values = (form: FormData) =>
  Object.fromEntries(
    [...form.entries()]
      .filter(([, v]) => typeof v === "string")
      .map(([k, v]) => [k, String(v).trim()]),
  );
const fail = (error: unknown, data: Record<string, string>): FormState => ({
  error:
    error instanceof APIError && error.isPublic
      ? error.message
      : "The change could not be saved. Please try again.",
  values: data,
});
const validID = (id: string) =>
  /^[1-9][0-9]{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n;
export async function saveCustomer(
  id: string | null,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { payload, user } = await requireOperator();
  const raw = values(form);
  let savedID: string;
  try {
    if (id && !validID(id)) throw new APIError("Invalid customer.", 400);
    const data = {
      name: raw.name,
      contactName: raw.contactName || null,
      contactEmail: raw.contactEmail || null,
      notes: raw.notes || null,
    };
    const saved = id
      ? await payload.update({
          collection: "customers",
          id,
          data,
          user,
          overrideAccess: false,
        })
      : await payload.create({
          collection: "customers",
          data: { ...data, status: "active" },
          user,
          overrideAccess: false,
        });
    savedID = saved.id;
  } catch (e) {
    return fail(e, raw);
  }
  revalidatePath("/customers");
  redirect("/customers/" + savedID);
}
export async function saveProject(
  id: string | null,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { payload, user } = await requireOperator();
  const raw = values(form);
  let savedID: string;
  try {
    if (id && !validID(id)) throw new APIError("Invalid project.", 400);
    const data = {
      name: raw.name,
      customer: raw.customer,
      url: raw.url || null,
      repositoryURL: raw.repositoryURL || null,
      notes: raw.notes || null,
    };
    const saved = id
      ? await payload.update({
          collection: "projects",
          id,
          data,
          user,
          overrideAccess: false,
        })
      : await payload.create({
          collection: "projects",
          data: { ...data, status: "active" },
          user,
          overrideAccess: false,
        });
    savedID = saved.id;
  } catch (e) {
    return fail(e, raw);
  }
  revalidatePath("/");
  redirect("/projects/" + savedID);
}
export async function archiveRecord(
  collection: "customers" | "projects",
  id: string,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { payload, user } = await requireOperator();
  try {
    if (!validID(id)) throw new APIError("Invalid record.", 400);
    await payload.update({
      collection,
      id,
      data: { status: form.get("restore") === "true" ? "active" : "archived" },
      overrideAccess: false,
      user,
    });
  } catch (e) {
    return fail(e, {});
  }
  revalidatePath(collection === "projects" ? "/" : "/customers");
  revalidatePath(`/${collection}/${id}`);
  return {};
}
export async function saveInstance(
  projectID: string,
  instanceID: string | null,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { payload, user } = await requireOperator();
  const raw = values(form);
  try {
    if (!validID(projectID) || (instanceID && !validID(instanceID)))
      throw new APIError("Invalid project.", 400);
    if (!instanceID && raw.confirmExisting !== "yes")
      throw new APIError("Confirm that this CMS is already deployed.", 400);
    const data = {
      project: projectID,
      label: raw.label,
      adminURL: raw.adminURL,
      schemaName: raw.schemaName,
      providerProjectID: raw.providerProjectID,
      provider: "vercel" as const,
      template: raw.template as
        | "webdock-landing"
        | "spitzli-portfolio"
        | "stall-business"
        | "custom",
      payloadVersion: raw.payloadVersion || null,
      status: raw.status as "active" | "suspended" | "retired",
      notes: raw.notes || null,
    };
    if (instanceID)
      await payload.update({
        collection: "cms-instances",
        id: instanceID,
        data,
        overrideAccess: false,
        user,
      });
    else
      await payload.create({
        collection: "cms-instances",
        data,
        overrideAccess: false,
        user,
      });
  } catch (e) {
    return fail(e, raw);
  }
  revalidatePath("/");
  redirect("/projects/" + projectID);
}
