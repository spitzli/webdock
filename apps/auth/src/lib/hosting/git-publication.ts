import { HostingError, type HostingActor } from "@webdock/hosting-contracts";
import type { Connection } from "./authorization";
import { authorizeHosting } from "./authorization";
import { transaction } from "./db";
import {
  authenticateGitWorker,
  gitEnvironmentSnapshot,
} from "./git-deployments";
import { createGitHubProvider } from "./git-github";
import {
  resolveGitVercelCredential,
  prepareGitVercelBuild,
} from "./git-vercel";
import { executeAppCommand } from "./apps";
import { limits } from "./allowances";
import { openEnvironment } from "./environment";

const changed = () =>
  new HostingError(
    409,
    "Git publication authorization changed. Review the release.",
  );
export function gitRegistryRepository(
  customerID: string,
  projectID: string,
  host = process.env.WEBDOCK_GIT_REGISTRY_HOST,
) {
  if (
    !host ||
    !/^[a-z0-9.-]+(?::[0-9]+)?$/.test(host) ||
    !/^[1-9][0-9]{0,18}$/.test(customerID) ||
    !/^[1-9][0-9]{0,18}$/.test(projectID)
  )
    throw new HostingError(
      409,
      "Configure verified EU artifact and registry storage.",
    );
  return `${host}/customers/${customerID}/projects/${projectID}`;
}
async function lease(
  db: Connection,
  credential: string,
  releaseID: string,
  generation: number,
) {
  const worker = await authenticateGitWorker(db, credential);
  const release = (
    await db.query(
      `SELECT r.*,a.kind,a.digest,a.storage_key,a.retained,b.id AS build_id,b.source_sha,b.provider_configuration_identity,
    s.target_id,s.recipe,s.repository_id,s.build_environment_encrypted,c.installation_id
    FROM webdock_auth.git_release r JOIN webdock_auth.git_artifact a ON a.id=r.artifact_id
    JOIN webdock_auth.git_build b ON b.id=a.build_id JOIN webdock_auth.git_source s ON s.project_id=r.project_id
    JOIN webdock_auth.git_connection c ON c.id=s.connection_id
    WHERE r.id=$1 AND r.generation=$2 AND r.worker_id=$3 AND r.worker_generation=$4 AND r.status='deploying' AND r.lease_until>now()
    AND s.desired_release_id=r.id AND s.enabled AND s.revision=r.source_revision AND c.state='active' AND c.generation=r.connection_generation AND a.retained
    FOR UPDATE OF r,s`,
      [releaseID, generation, worker.id, worker.generation],
    )
  ).rows[0];
  if (
    !release ||
    !release.approved_by ||
    !["studio", "oauth", "git-policy"].includes(release.approved_source)
  )
    throw changed();
  const actor: HostingActor = {
    subject: release.approved_by,
    sessionID: release.approved_session_id,
    source: release.approved_source,
    scopes: release.approved_scopes ?? [],
  };
  await authorizeHosting(
    actor,
    { projectID: release.project_id, write: true },
    db,
  );
  const source = (
    await db.query(
      "SELECT * FROM webdock_auth.git_source WHERE project_id=$1",
      [release.project_id],
    )
  ).rows[0];
  if (
    (await gitEnvironmentSnapshot(db, source)).identity !==
    release.environment_identity
  )
    throw changed();
  return { release, actor, source };
}
/** Automatic Actions releases follow the current branch; explicit approvals may roll back. */
export async function assertGitAutomaticSourceHead(
  source: { build_provider: string; branch: string },
  release: {
    approved_source: string;
    installation_id: string;
    repository_id: string;
    source_sha: string;
  },
  provider: {
    resolveSource(input: {
      installationID: string;
      repositoryID: string;
      branch: string;
    }): Promise<{ sha: string }>;
  },
) {
  if (source.build_provider !== "github-actions" || release.approved_source !== "git-policy")
    return;
  const head = await provider.resolveSource({
    installationID: release.installation_id,
    repositoryID: release.repository_id,
    branch: source.branch,
  });
  if (head.sha !== release.source_sha) throw changed();
}

export async function prepareGitPublication(
  credential: string,
  releaseID: string,
  generation: number,
) {
  return transaction(async (db) => {
    const { release: r, source } = await lease(
      db,
      credential,
      releaseID,
      generation,
    );
    const github = createGitHubProvider();
    await github.revalidateRepository(r.installation_id, r.repository_id);
    await assertGitAutomaticSourceHead(source, r, github);
    if (r.recipe === "dockerfile") {
      const capability = (
        await db.query(
          "SELECT a.observation->'capabilities'->>'registryVersion' AS version FROM webdock_auth.hosting_agent a JOIN webdock_auth.hosting_project p ON p.cluster_id=a.cluster_id WHERE p.project_id=$1 AND NOT a.revoked",
          [r.project_id],
        )
      ).rows[0];
      if (capability?.version !== "1")
        throw new HostingError(
          409,
          "Install verified registry pull access on the target cluster.",
        );
      const repository = gitRegistryRepository(r.customer_id, r.project_id);
      await db.query(
        "UPDATE webdock_auth.git_release SET publication_started_at=now() WHERE id=$1",
        [r.id],
      );
      return { kind: "oci", repository };
    }
    const provider = await resolveGitVercelCredential(db, {
      customerID: r.customer_id,
      projectID: r.project_id,
      targetID: r.target_id,
    });
    const buildEnvironment = openEnvironment(
      `git-build:${source.id}`,
      source.build_environment_encrypted,
    );
    const prepared = await prepareGitVercelBuild(provider, {
      buildEnvironment,
      allowedBuildVariables: Object.keys(buildEnvironment),
    });
    if (
      !r.provider_configuration_identity ||
      r.provider_configuration_identity !== prepared.configurationChecksum
    )
      throw changed();
    await db.query(
      "UPDATE webdock_auth.git_release SET publication_started_at=now() WHERE id=$1",
      [r.id],
    );
    return {
      kind: "vercel",
      settings: prepared.vercelSettings,
      token: provider.token,
    };
  });
}
export async function publishGitContainer(
  credential: string,
  input: { releaseID: string; generation: number; image: string },
) {
  return transaction(async (db) => {
    const { release: r, actor } = await lease(
      db,
      credential,
      input.releaseID,
      input.generation,
    );
    if (r.recipe !== "dockerfile" || !r.publication_started_at) throw changed();
    const repository = gitRegistryRepository(r.customer_id, r.project_id);
    if (
      !input.image.startsWith(repository + "@sha256:") ||
      !/^[a-f0-9]{64}$/.test(input.image.slice(repository.length + 8))
    )
      throw new HostingError(400, "Invalid immutable registry image.");
    if (r.operation_id) return { operationID: r.operation_id };
    await createGitHubProvider().revalidateRepository(
      r.installation_id,
      r.repository_id,
    );
    const app = (
      await db.query(
        "SELECT * FROM webdock_auth.hosting_app WHERE id=$1 AND project_id=$2 FOR UPDATE",
        [r.target_id, r.project_id],
      )
    ).rows[0];
    if (!app || app.status === "deleted") throw changed();
    const result = (await executeAppCommand(
      actor,
      {
        action: "apps.update",
        appID: app.id,
        revision: app.revision,
        spec: { ...app.spec, template: "custom", image: input.image },
        subscriptionRevision: (await limits(db, r.customer_id))
          .subscriptionRevision,
        idempotencyKey: `git-release-${r.id}`,
      },
      db,
    )) as { id: string };
    await db.query(
      "UPDATE webdock_auth.git_release SET operation_id=$2 WHERE id=$1",
      [r.id, result.id],
    );
    return { operationID: result.id };
  });
}
export async function observeGitPublication(
  credential: string,
  releaseID: string,
  generation: number,
) {
  return transaction(async (db) => {
    const { release: r } = await lease(db, credential, releaseID, generation);
    if (r.recipe === "dockerfile") {
      if (!r.operation_id) return { status: "needs-reconciliation" };
      const observed = (
        await db.query(
          "SELECT o.status,o.target_revision,a.observed_revision,a.status AS app_status FROM webdock_auth.hosting_operation o JOIN webdock_auth.hosting_app a ON a.id=o.app_id WHERE o.id=$1 AND o.project_id=$2 AND a.id=$3",
          [r.operation_id, r.project_id, r.target_id],
        )
      ).rows[0];
      if (!observed) return { status: "needs-reconciliation" };
      const ready =
        observed.status === "succeeded" &&
        observed.app_status === "ready" &&
        observed.observed_revision === observed.target_revision;
      return {
        status: ready
          ? "ready"
          : ["failed", "needs-reconciliation"].includes(observed.status)
            ? observed.status
            : "deploying",
        operationID: r.operation_id,
        healthVerified: ready,
      };
    }
    const provider = await resolveGitVercelCredential(db, {
      customerID: r.customer_id,
      projectID: r.project_id,
      targetID: r.target_id,
    });
    const { createGitVercelObserver } =
      await import("./git-vercel-publication");
    if (!r.provider_deployment_id) return { status: "needs-reconciliation" };
    const observed = await createGitVercelObserver(provider).observeDeployment({
      deploymentID: r.provider_deployment_id,
      releaseID: r.id,
      healthPath: "/",
    });
    return {
      status: observed.status,
      providerDeploymentID: observed.deploymentID,
      healthVerified: observed.status === "ready",
      ...(observed.status === "ready" ? { region: "fra1" } : {}),
    };
  });
}
export async function recordGitVercelPublication(
  credential: string,
  input: { releaseID: string; generation: number; providerURL: string },
) {
  return transaction(async (db) => {
    const { release: r } = await lease(
      db,
      credential,
      input.releaseID,
      input.generation,
    );
    if (r.recipe !== "vercel" || !r.publication_started_at) throw changed();
    const provider = await resolveGitVercelCredential(db, {
      customerID: r.customer_id,
      projectID: r.project_id,
      targetID: r.target_id,
    });
    const { createGitVercelObserver } =
      await import("./git-vercel-publication");
    const observed = await createGitVercelObserver(provider).resolveDeployment({
      providerURL: input.providerURL,
      releaseID: r.id,
    });
    if (
      r.provider_deployment_id &&
      r.provider_deployment_id !== observed.deploymentID
    )
      throw changed();
    await db.query(
      "UPDATE webdock_auth.git_release SET provider_deployment_id=$2 WHERE id=$1",
      [r.id, observed.deploymentID],
    );
    return { providerDeploymentID: observed.deploymentID };
  });
}
