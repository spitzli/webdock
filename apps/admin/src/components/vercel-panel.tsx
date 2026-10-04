import Link from "next/link";
import { requireOperator } from "../lib/server";
import { projectVercelStatus } from "../lib/vercel-project";
import type { VercelDeployment } from "../lib/vercel-api";
const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC"
    : "Not available";
function Deployment({ deployment }: { deployment: VercelDeployment }) {
  return (
    <article className="vercel-deployment">
      <div className="section-heading">
        <strong>
          {deployment.target === "production" ? "Production" : "Preview"}
        </strong>
        <span
          className={
            "badge " + (deployment.status === "READY" ? "connected" : "")
          }
        >
          {deployment.status.toLowerCase()}
        </span>
      </div>
      {deployment.commitMessage && <p>{deployment.commitMessage}</p>}
      <p className="muted">
        {deployment.branch || "No Git branch recorded"}
        {deployment.commitSHA ? " · " + deployment.commitSHA.slice(0, 8) : ""}
      </p>
      <p className="muted">
        <time dateTime={deployment.createdAt || undefined}>
          {time(deployment.createdAt)}
        </time>
      </p>
      {deployment.url && (
        <a
          className="small-link"
          href={deployment.url}
          target="_blank"
          rel="noreferrer"
        >
          Open deployment ↗
        </a>
      )}
    </article>
  );
}
const messages: Record<string, string> = {
  setup: "Connect Vercel in Integrations to view deployment information.",
  disconnected:
    "The Vercel connection is not active. Connect it in Integrations.",
  unlinked:
    "Link this Studio project to Vercel to see live deployment information.",
  unavailable:
    "Vercel is temporarily unavailable. Your Studio records remain available.",
  forbidden:
    "This project is not included in the Vercel integration’s selected access.",
  not_found: "The linked Vercel project could not be found.",
};
export async function VercelProjectPanel({ projectID }: { projectID: string }) {
  const actor = await requireOperator();
  let result;
  try {
    result = await projectVercelStatus(actor, projectID);
  } catch {
    result = { state: "unavailable" as const };
  }
  if (result.state !== "ready" || !("snapshot" in result))
    return (
      <section className="panel">
        <h2>Vercel</h2>
        <p>{messages[result.state] || messages.unavailable}</p>
        <Link className="small-link" href="/integrations#vercel">
          Manage connection
        </Link>
      </section>
    );
  const s = result.snapshot;
  const teamSlug = process.env.WEBDOCK_VERCEL_TEAM_SLUG;
  const dashboard =
    teamSlug && /^[a-z0-9-]+$/.test(teamSlug)
      ? `https://vercel.com/${encodeURIComponent(teamSlug)}/${encodeURIComponent(s.name)}`
      : "https://vercel.com/dashboard";
  return (
    <section
      className="panel vercel-panel"
      aria-labelledby="vercel-project-heading"
    >
      <div className="section-heading">
        <h2 id="vercel-project-heading">Vercel · {s.name}</h2>
        <a
          className="small-link"
          href={dashboard}
          target="_blank"
          rel="noreferrer"
        >
          Open Vercel ↗
        </a>
      </div>
      <p className="muted">
        {s.framework || "Framework not specified"} · Node.js{" "}
        {s.nodeVersion || "not specified"}
      </p>
      <h3>Current production</h3>
      {s.productionDeployment ? (
        <Deployment deployment={s.productionDeployment} />
      ) : (
        <p>No production deployment is currently assigned.</p>
      )}
      <h3>Domains</h3>
      {s.domains.length ? (
        <ul className="vercel-domains">
          {s.domains.map((domain) => (
            <li key={domain.name}>
              <span>{domain.name}</span>
              <small>
                {domain.verified ? "Verified" : "Verification pending"}
                {domain.redirect ? " · Redirects to " + domain.redirect : ""}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p>No domains attached.</p>
      )}
      <h3>Recent deployments</h3>
      {s.deployments.map((deployment) => (
        <Deployment key={deployment.id} deployment={deployment} />
      ))}
      {!s.deployments.length && <p>No recent deployments.</p>}
      <div className="vercel-refresh">
        <small>Checked {time(s.checkedAt)}. Read-only data from Vercel.</small>
        <a className="small-link" href={"/projects/" + projectID}>
          Refresh Vercel data
        </a>
      </div>
    </section>
  );
}
