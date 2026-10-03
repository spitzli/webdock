import { APIError } from "payload";
import { z } from "zod";
import { recordID, type RegistryActor } from "./registry";
import type { configureGitHub, GitHubSession } from "./github";

const positive = z.coerce
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
export const githubSelection = z
  .object({
    project: recordID,
    installation: positive,
    installationPage: positive.max(10000),
    page: positive.max(10000),
    repository: positive,
  })
  .strict();

export async function linkGitHubRepository(
  actor: RegistryActor,
  github: ReturnType<typeof configureGitHub>,
  session: GitHubSession,
  input: unknown,
) {
  if (
    actor.user.collection !== "users" ||
    actor.user.role !== "operator" ||
    session.operatorID !== actor.user.id
  )
    throw new APIError("An operator is required.", 403);
  const { project: id, ...selection } = githubSelection.parse(input);
  // Re-read GitHub membership at save time; never trust a URL or repository from the browser.
  const repository = await github.repository(session, selection);
  const project = await actor.payload.findByID({
    collection: "projects",
    id,
    depth: 0,
    user: actor.user,
    overrideAccess: false,
  });
  if (project.status !== "active")
    throw new APIError(
      "Restore this project before linking a repository.",
      409,
    );
  return actor.payload.update({
    collection: "projects",
    id,
    data: { repositoryURL: repository.url },
    user: actor.user,
    overrideAccess: false,
  });
}
