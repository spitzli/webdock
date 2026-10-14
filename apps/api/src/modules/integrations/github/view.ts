import {
  getGitHub,
  githubOrigin,
  type GitHubInstallation,
  type GitHubRepository,
} from "./client";
import { browserHeaders } from "../../portal/request-context";
import { currentRegistryActor } from "../operator";
export async function githubView(input: Record<string, string>) {
  const actor = await currentRegistryActor(),
    github = getGitHub();
  const positive = (raw: string | undefined, fallback: number) =>
    raw && /^\d+$/.test(raw) && Number(raw) > 0 && Number(raw) <= 10000
      ? Number(raw)
      : fallback;
  const installationPage = positive(input.installationPage, 1),
    page = positive(input.page, 1);
  let installation = positive(input.installation, 0),
    installations: GitHubInstallation[] = [],
    repositories: GitHubRepository[] = [],
    installationPages = 1,
    repositoryPages = 1,
    problem = false;
  const session = github
    ? await github.session(browserHeaders(), actor.user.id)
    : null;
  if (github && session)
    try {
      const available = await github.installations(session, installationPage);
      installations = available.items;
      installationPages = available.totalPages;
      if (!installation) installation = installations[0]?.id || 0;
      if (installation) {
        const result = await github.repositories(
          session,
          installation,
          installationPage,
          page,
        );
        repositories = result.items;
        repositoryPages = result.totalPages;
      }
    } catch {
      problem = true;
    }
  return {
    configured: !!github,
    session: session ? { login: session.login } : null,
    installURL: github?.installURL || null,
    permissionsURL: github?.permissionsURL || null,
    callbackURL:
      github?.callbackURL ||
      new URL("/api/github/callback", githubOrigin()).href,
    installations,
    repositories,
    installationPages,
    repositoryPages,
    installation,
    installationPage,
    page,
    problem,
  };
}
