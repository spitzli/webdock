import Link from "next/link";
import { headers } from "next/headers";
import { requireOperator } from "../../../../lib/server";
import {
  getGitHub,
  githubOrigin,
  type GitHubInstallation,
  type GitHubRepository,
} from "../../../../lib/github";
import { GitHubRepositories } from "../../../../components/github-repositories";
import { mcpResource } from "../../../../lib/mcp-auth";

const messages: Record<string, string> = {
  connected: "GitHub connected. Choose an installation and a repository below.",
  disconnected:
    "GitHub disconnected from this browser. Existing project links are unchanged.",
  failed: "GitHub authorization did not complete. Start Connect GitHub again.",
  expired:
    "Your GitHub connection expired. Connect again to choose repositories.",
  "save-failed":
    "The repository could not be linked. Refresh the list and check that the project and GitHub installation are still accessible.",
  setup: "Complete the GitHub App setup before connecting.",
};
const positive = (value: unknown, fallback: number) =>
  typeof value === "string" && /^[1-9][0-9]{0,8}$/.test(value)
    ? Number(value)
    : fallback;

export default async function Integrations({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { payload, user } = await requireOperator();
  const query = await searchParams;
  let github: ReturnType<typeof getGitHub> = null;
  try {
    github = getGitHub();
  } catch {
    /* Show setup when configuration is incomplete or invalid. */
  }
  const session = github
    ? await github.session(await headers(), user.id)
    : null;
  const installationPage = Math.min(10000, positive(query.installationPage, 1));
  const page = Math.min(10000, positive(query.page, 1));
  let installations: GitHubInstallation[] = [];
  let installationPages = 1;
  let repositories: GitHubRepository[] = [];
  let repositoryPages = 1;
  let installation = positive(query.installation, 0);
  let problem = "";
  if (github && session) {
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
      problem =
        "GitHub access could not be checked. Reconnect or review the app’s installation and read-only metadata permission.";
    }
  }
  const projects = session
    ? await payload.find({
        collection: "projects",
        where: { status: { equals: "active" } },
        limit: 1000,
        sort: "name",
        depth: 0,
        user,
        overrideAccess: false,
      })
    : null;
  const notice =
    typeof query.github === "string" ? messages[query.github] : null;
  const isError = ["failed", "expired", "save-failed"].includes(
    String(query.github),
  );
  const callback =
    github?.callbackURL || new URL("/api/github/callback", githubOrigin()).href;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Integrations</h1>
          <p>Connect your repositories and the tools you work with.</p>
        </div>
      </div>
      {notice && (
        <p
          className={isError ? "error" : "success"}
          role={isError ? "alert" : "status"}
        >
          {notice}
        </p>
      )}
      <div className="detail-grid">
        <section className="panel" aria-labelledby="github-heading">
          <div className="section-heading">
            <h2 id="github-heading">GitHub</h2>
            <span className={`badge ${session ? "connected" : ""}`}>
              {session
                ? "Connected"
                : github
                  ? "Not connected"
                  : "Setup required"}
            </span>
          </div>
          <p>
            Choose repositories from a GitHub App installation and link them to
            Webdock projects.
          </p>
          {session ? (
            <>
              <p>
                Connected as <strong>{session.login}</strong>. This browser
                connection expires after eight hours.
              </p>
              <div className="section-heading">
                <a className="button secondary" href={github!.installURL}>
                  Manage selected repositories
                </a>
                <form action="/api/github/disconnect" method="post">
                  <button className="text-button" type="submit">
                    Disconnect this browser
                  </button>
                </form>
              </div>
              {problem ? (
                <>
                  <p className="error" role="alert">
                    {problem}
                  </p>
                  <form action="/api/github/connect" method="post">
                    <button className="button" type="submit">
                      Reconnect GitHub
                    </button>
                  </form>
                </>
              ) : (
                <>
                  {installations.length ? (
                    <>
                      <form
                        className="editor"
                        action="/integrations"
                        method="get"
                      >
                        <input
                          type="hidden"
                          name="installationPage"
                          value={installationPage}
                        />
                        <div className="field wide">
                          <label htmlFor="github-installation">
                            GitHub account or organisation
                          </label>
                          <select
                            id="github-installation"
                            name="installation"
                            defaultValue={installation}
                          >
                            {installations.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.account}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-footer">
                          <button className="button secondary" type="submit">
                            Browse repositories
                          </button>
                        </div>
                      </form>
                      <GitHubRepositories
                        repositories={repositories}
                        projects={projects?.docs || []}
                        installation={installation}
                        installationPage={installationPage}
                        page={page}
                        totalPages={repositoryPages}
                      />
                    </>
                  ) : (
                    <p>
                      No accessible installations found. Install the app on a
                      GitHub account and choose the repositories to make
                      available.
                    </p>
                  )}
                  {installationPages > 1 && (
                    <nav
                      className="pagination"
                      aria-label="GitHub installation pages"
                    >
                      {installationPage > 1 && (
                        <Link
                          href={`/integrations?installationPage=${installationPage - 1}`}
                        >
                          Previous accounts
                        </Link>
                      )}
                      <span>
                        Accounts page {installationPage} of {installationPages}
                      </span>
                      {installationPage < installationPages && (
                        <Link
                          href={`/integrations?installationPage=${installationPage + 1}`}
                        >
                          Next accounts
                        </Link>
                      )}
                    </nav>
                  )}
                </>
              )}
              <p>
                <a href={github!.permissionsURL}>
                  Review or revoke access on GitHub
                </a>
              </p>
            </>
          ) : github ? (
            <>
              <form action="/api/github/connect" method="post">
                <button className="button" type="submit">
                  Connect GitHub
                </button>
              </form>
              <p>
                <a href={github.installURL}>Install the GitHub App</a> and
                choose only the repositories you want to use.
              </p>
            </>
          ) : (
            <p>
              Register a GitHub App once to enable repository selection for
              Studio.
            </p>
          )}
          <details open={!github}>
            <summary>GitHub App setup</summary>
            <ol>
              <li>
                <a href="https://github.com/settings/apps/new">
                  Register a GitHub App
                </a>{" "}
                with the callback URL{" "}
                <code style={{ overflowWrap: "anywhere" }}>{callback}</code>.
              </li>
              <li>
                Grant only{" "}
                <strong>Repository permissions → Metadata → Read-only</strong>.
                Leave other permissions and webhook events off. Keep user access
                token expiration enabled.
              </li>
              <li>
                Set <code>WEBDOCK_GITHUB_CLIENT_ID</code>,{" "}
                <code>WEBDOCK_GITHUB_CLIENT_SECRET</code>, and{" "}
                <code>WEBDOCK_GITHUB_APP_SLUG</code> in Studio’s server
                environment. Studio uses its existing SSO cookie secret to
                encrypt the connection.
              </li>
              <li>
                Install the app with <strong>Only select repositories</strong>,
                then return here and choose <strong>Connect GitHub</strong>.
                Leave automatic user authorization during installation off so
                this connection starts in Studio.
              </li>
            </ol>
            <p>
              <a href="https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app">
                GitHub App authorization documentation
              </a>
            </p>
          </details>
        </section>
        <aside>
          <section className="panel cms-panel" aria-labelledby="mcp-heading">
            <h2 id="mcp-heading">Webdock MCP</h2>
            <p>
              Use Webdock’s project registry from an MCP-compatible assistant.
              Authorization uses your central Webdock account.
            </p>
            <dl>
              <dt>Server URL</dt>
              <dd>
                <code style={{ overflowWrap: "anywhere" }}>
                  {mcpResource()}
                </code>
              </dd>
              <dt>HTTP API</dt>
              <dd><code>{new URL("/api/registry", mcpResource()).href}</code></dd>
              <dt>Read scope</dt>
              <dd>
                <code>webdock:read</code> — browse customers, projects, CMS
                instances, and activity.
              </dd>
              <dt>Write scope</dt>
              <dd>
                <code>webdock:write</code> — create and update registry records.
              </dd>
            </dl>
            <a
              className="button secondary"
              href="https://auth.webdock.dev/connections"
            >
              Manage connections
            </a>
            <p>
              Enable automatic token renewal when registering a client for remote work. Interactive sign-in and consent still require your browser. Only operators can access the registry. Changes made through
              integrations appear in Activity.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
