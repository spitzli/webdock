import type { RegistryActor } from "./registry";
import { recordID } from "./registry";
import { vercelSettings } from "./vercel-settings";
import { loadVercelConnection, loadVercelLink } from "./vercel-store";
import { fetchVercelProject, VercelAPIError } from "./vercel-api";
export async function projectVercelStatus(
  actor: RegistryActor,
  projectID: string,
) {
  if (actor.user.collection !== "users" || actor.user.role !== "operator")
    throw Error("Operator access required.");
  const project = await actor.payload.findByID({
    collection: "projects",
    id: recordID.parse(projectID),
    user: actor.user,
    overrideAccess: false,
    depth: 0,
  });
  if (!project) throw Error("Project not found.");
  const settings = vercelSettings();
  if (!settings) return { state: "setup" as const };
  const credential = await loadVercelConnection(
    actor,
    settings.teamID,
    settings.cookieSecret,
  );
  if (!credential) return { state: "disconnected" as const };
  let linked = await loadVercelLink(actor, project.id, settings.teamID);
  if (!linked) {
    const instances = await actor.payload.find({
      collection: "cms-instances",
      where: {
        and: [
          { project: { equals: project.id } },
          { provider: { equals: "vercel" } },
        ],
      },
      limit: 1,
      depth: 0,
      user: actor.user,
      overrideAccess: false,
    });
    const fallback = instances.docs[0]?.providerProjectID;
    if (fallback && /^prj_[A-Za-z0-9]+$/.test(fallback)) linked = fallback;
  }
  if (!linked) return { state: "unlinked" as const };
  try {
    return {
      state: "ready" as const,
      snapshot: await fetchVercelProject({
        token: credential.accessToken,
        teamID: settings.teamID,
        projectID: linked,
      }),
    };
  } catch (error) {
    if (error instanceof VercelAPIError) return { state: error.code };
    throw error;
  }
}
