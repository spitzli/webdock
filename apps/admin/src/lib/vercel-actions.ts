"use server";
import { revalidatePath } from "next/cache";
import { requireOperator } from "./server";
import { vercelSettings } from "./vercel-settings";
import { loadVercelConnection, saveVercelLink } from "./vercel-store";
import { fetchVercelProject } from "./vercel-api";
import { recordID } from "./registry";
export type VercelLinkState = { error?: string; message?: string };
export async function linkVercelProject(
  _state: VercelLinkState,
  form: FormData,
): Promise<VercelLinkState> {
  const actor = await requireOperator();
  try {
    const settings = vercelSettings();
    if (!settings) throw Error();
    const credential = await loadVercelConnection(
      actor,
      settings.teamID,
      settings.cookieSecret,
    );
    if (!credential) throw Error();
    const projectID = recordID.parse(String(form.get("project")));
    const vercelProjectID = String(form.get("vercelProject"));
    const snapshot = await fetchVercelProject({
      token: credential.accessToken,
      teamID: settings.teamID,
      projectID: vercelProjectID,
    });
    await saveVercelLink(actor, projectID, settings.teamID, snapshot.projectID);
    revalidatePath("/projects/" + projectID);
    revalidatePath("/integrations");
    return {
      message:
        "Vercel project linked. Open the Studio project to see live deployment data.",
    };
  } catch {
    return {
      error:
        "The project could not be linked. Check access to both projects, then try again.",
    };
  }
}
