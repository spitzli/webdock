import type { Connection } from "./authorization";
import { clusterView } from "./clusters";
export async function applicationCapabilities(
  db: Connection,
  clusterID: string,
) {
  const cluster = await clusterView(db, clusterID);
  return cluster.state === "revoked"
    ? undefined
    : cluster.observation?.capabilities;
}
export async function setupBuildCapabilities(
  db: Connection,
  projectID: string,
) {
  if (process.env.DATABASE_RLS_SECRET)
    return (
      await db.query(
        "SELECT webdock_rls.setup_build_capabilities($1) AS value",
        [projectID],
      )
    ).rows[0].value as { isolated: boolean; githubActions: boolean };
  const rows = (
    await db.query(
      "SELECT DISTINCT isolation FROM webdock_auth.git_worker WHERE enabled",
    )
  ).rows;
  return {
    isolated: rows.some((r) => r.isolation === "microvm"),
    githubActions: rows.some((r) => r.isolation === "artifact-only"),
  };
}
