import type { HostingPorts } from "./ports";
import type { Connection } from "./authorization";
export type Dependencies = {
  clusterView: ReturnType<
    typeof import("./clusters").createHostingClusters
  >["clusterView"];
  env: HostingPorts["env"];
};

export function createHostingSetupCapabilities(dependencies: Dependencies) {
  async function applicationCapabilities(db: Connection, clusterID: string) {
    const cluster = await dependencies.clusterView(db, clusterID);
    return cluster.state === "revoked"
      ? undefined
      : cluster.observation?.capabilities;
  }
  async function setupBuildCapabilities(db: Connection, projectID: string) {
    if (dependencies.env.DATABASE_RLS_SECRET)
      return (
        await db.query(
          "SELECT webdock_rls.setup_build_capabilities($1) AS value",
          [projectID],
        )
      ).rows[0].value as {
        isolated: boolean;
        githubActions: boolean;
      };
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
  return { applicationCapabilities, setupBuildCapabilities };
}
