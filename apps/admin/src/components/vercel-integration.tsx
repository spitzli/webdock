import Link from "next/link";
import { requireOperator } from "../lib/server";
import { vercelSettings } from "../lib/vercel-settings";
import { loadVercelConnection } from "../lib/vercel-store";
import { listVercelProjects } from "../lib/vercel-api";
import { VercelLinkForm } from "./vercel-link-form";
export async function VercelIntegration({
  status,
  cursor,
}: {
  status?: string;
  cursor?: string;
}) {
  const actor = await requireOperator(),
    settings = vercelSettings();
  const message =
    status === "connected"
      ? "Vercel connected. Choose a project below."
      : status === "disconnected"
        ? "Vercel disconnected from Studio."
        : status === "failed"
          ? "The Vercel connection could not be verified. Start from Studio and select the configured team with read-only permissions."
          : null;
  let credential = null,
    problem = "",
    available: {
      projects: { id: string; name: string }[];
      nextCursor: string | null;
    } = { projects: [], nextCursor: null };
  if (settings)
    try {
      credential = await loadVercelConnection(
        actor,
        settings.teamID,
        settings.cookieSecret,
      );
      if (credential)
        available = await listVercelProjects({
          token: credential.accessToken,
          teamID: settings.teamID,
          cursor,
        });
    } catch {
      problem =
        "Vercel could not be reached. Reconnect or review its selected project permissions.";
    }
  const projects = credential
    ? await actor.payload.find({
        collection: "projects",
        where: { status: { equals: "active" } },
        limit: 100,
        depth: 0,
        sort: "name",
        user: actor.user,
        overrideAccess: false,
      })
    : null;
  return (
    <section className="panel" id="vercel">
      <div className="section-heading">
        <h2>Vercel</h2>
        <span
          className={"badge " + (credential && !problem ? "connected" : "")}
        >
          {credential
            ? "Connected"
            : settings
              ? "Not connected"
              : "Setup required"}
        </span>
      </div>
      <p>
        Live project details, production status, recent deployments and domains.
        This connection only reads Vercel data.
      </p>
      {message && (
        <p className="status-notice" role="status">
          {message}
        </p>
      )}
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {!settings ? (
        <p>
          Register the private Webdock Studio integration in Vercel and
          configure its client credentials to enable connection.
        </p>
      ) : (
        <>
          <form action="/api/vercel/connect" method="post">
            <button className="button">
              {credential ? "Reconnect Vercel" : "Connect Vercel"}
            </button>
          </form>
          {credential && (
            <>
              <VercelLinkForm
                projects={projects?.docs || []}
                vercelProjects={available.projects}
              />
              <p className="muted">
                Existing CMS hosting references are used automatically. You can
                also link projects that have no CMS.
              </p>
              <nav className="pagination" aria-label="Vercel project pages">
                {cursor && (
                  <Link href="/integrations#vercel">First Vercel projects</Link>
                )}
                {available.nextCursor && (
                  <Link
                    href={
                      "/integrations?vercelCursor=" +
                      encodeURIComponent(available.nextCursor) +
                      "#vercel"
                    }
                  >
                    More Vercel projects
                  </Link>
                )}
              </nav>
              <details>
                <summary>Disconnect</summary>
                <form action="/api/vercel/disconnect" method="post">
                  <label className="field">
                    <span>Disconnect the team connection from Studio</span>
                    <input type="checkbox" required />
                  </label>
                  <button className="button secondary">
                    Disconnect from Studio
                  </button>
                </form>
                <p className="muted">
                  Project mappings are preserved. To revoke Vercel’s permission
                  completely, remove this integration in Vercel.
                </p>
                <a
                  href="https://vercel.com/dashboard/integrations"
                  target="_blank"
                  rel="noreferrer"
                >
                  Manage Vercel permissions ↗
                </a>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
