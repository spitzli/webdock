"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { demoRequest } from "@/lib/demo-bridges";
export async function updateRequest(_state: { message?: string; error?: string }, form: FormData): Promise<{ message?: string; error?: string }> {
 try {
  const requestHeaders = await headers();
  const origin = new URL(process.env.NEXT_PUBLIC_SERVER_URL || "https://studio.webdock.dev").origin;
  if (requestHeaders.get("origin") !== origin) throw Error("Invalid request origin.");
  const bindingID = String(form.get("bindingID") || "");
  if (!/^[1-9][0-9]{0,18}$/.test(bindingID)) throw Error("Invalid website.");
  await demoRequest(bindingID, 1, { id: String(form.get("id")), status: String(form.get("status")), internalNote: String(form.get("internalNote") || ""), updatedAt: String(form.get("updatedAt")) });
  revalidatePath(`/sites/${bindingID}/requests`);
  return { message: "Anfrage gespeichert." };
 } catch (error) { return { error: error instanceof Error ? error.message : "Die Anfrage konnte nicht gespeichert werden." }; }
}
