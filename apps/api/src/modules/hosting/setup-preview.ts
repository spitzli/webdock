import { randomUUID } from "node:crypto";
import {
  HostingError,
  appSpecSchema,
  healthcheckImage,
  resolveAppSpec,
  type HostingActor,
  type SetupConfiguration,
  type SetupPreview,
} from "@webdock/hosting-contracts";
import { transaction } from "./db";
import { authorizeHosting } from "./authorization";
import { limits } from "./allowances";
import { checkDemand } from "./reservations";
import { appDemand } from "@webdock/hosting-contracts";
import { executeDatabaseCommand } from "./databases";
import { createGitHubProvider } from "./git-github";
import { applicationMailRoute } from "./mail-binding";
export { assertSetupConfirmation } from "./setup-confirmation";
export async function previewProjectSetup(
  actor: HostingActor,
  input: {
    id: string;
    projectID: string;
    revision: number;
    configuration: SetupConfiguration;
    databaseID?: string;
  },
): Promise<SetupPreview> {
  const config = input.configuration;
  const result: SetupPreview = {
    id: randomUUID(),
    revision: input.revision,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    sourceSHA: null,
    image: null,
    subscriptionRevision: 0,
    blockers: [],
    offers: [],
  };
  await transaction(async (db) => {
    const access = await authorizeHosting(
      actor,
      { projectID: input.projectID, write: true },
      db,
    );
    const cap = await limits(db, access.customerID!, input.projectID, "k3s");
    result.subscriptionRevision = cap.subscriptionRevision;
    if (!access.project?.cluster_id || access.project.provider !== "k3s") {
      result.blockers.push(
        "Assign managed container hosting before setting up this application.",
      );
      return;
    }
    if (process.env.WEBDOCK_SETUP_ENABLED !== "true")
      result.blockers.push("Enable the project setup worker before deploying.");
    try {
      await checkDemand(db, {
        customerID: access.customerID!,
        projectID: input.projectID,
        clusterID: access.project.cluster_id,
        provider: "k3s",
        demand: appDemand({
          ...config.spec,
          template: "custom",
          image: healthcheckImage,
        }),
        subscriptionRevision: cap.subscriptionRevision,
      });
    } catch (error) {
      result.blockers.push(
        error instanceof HostingError
          ? error.message
          : "Hosting capacity could not be verified.",
      );
    }
    const agent = (
      await db.query(
        "SELECT observation FROM webdock_auth.hosting_agent WHERE cluster_id=$1 AND NOT revoked",
        [access.project.cluster_id],
      )
    ).rows[0]?.observation;
    if (
      (config.database.mode !== "none" || config.mail) &&
      agent?.capabilities?.serviceBindingsVersion !== 1
    )
      result.blockers.push(
        "Update the cluster agent before connecting services.",
      );
    if (
      config.source.kind !== "template" &&
      !access.operator &&
      !access.project.own_images
    )
      result.blockers.push("Custom images are not enabled for this project.");
    if (
      config.database.mode === "new" &&
      !input.databaseID &&
      process.env.WEBDOCK_DATABASE_CLUSTER_ID !== access.project.cluster_id
    )
      result.blockers.push(
        "Managed databases must use the same cluster as this application.",
      );
    if (config.source.kind === "image") {
      if (!appSpecSchema.shape.image.safeParse(config.source.reference).success)
        result.blockers.push(
          "Use an immutable image digest supported by this cluster.",
        );
      else result.image = config.source.reference;
    } else if (config.source.kind === "template")
      result.image = resolveAppSpec({
        ...config.spec,
        template: "healthcheck",
        image: healthcheckImage,
      }).image;
    else {
      const connection = (
        await db.query(
          "SELECT c.installation_id FROM webdock_auth.git_connection c JOIN webdock_auth.git_repository r ON r.connection_id=c.id WHERE c.customer_id=$1 AND c.id=$2 AND r.repository_id=$3 AND c.state='active'",
          [
            access.customerID,
            config.source.connectionID,
            config.source.repositoryID,
          ],
        )
      ).rows[0];
      if (!connection)
        result.blockers.push("Connect an authorized GitHub repository first.");
      else
        try {
          result.sourceSHA = (
            await createGitHubProvider().resolveSource({
              installationID: connection.installation_id,
              repositoryID: config.source.repositoryID!,
              branch: config.source.branch,
            })
          ).sha;
        } catch {
          result.blockers.push(
            "GitHub source could not be verified. Reconnect or try again.",
          );
        }
      if (
        !(
          await db.query(
            "SELECT 1 FROM webdock_auth.git_worker WHERE enabled AND isolation=$1 LIMIT 1",
            [
              config.source.buildProvider === "isolated"
                ? "microvm"
                : "artifact-only",
            ],
          )
        ).rowCount
      )
        result.blockers.push(
          "Configure verified build capacity before deploying from Git.",
        );
      if (
        !process.env.WEBDOCK_GIT_REGISTRY_HOST ||
        agent?.capabilities?.registryVersion !== 1
      )
        result.blockers.push(
          "Configure verified artifact and registry storage.",
        );
      if (config.source.dockerfile !== "Dockerfile")
        result.blockers.push(
          "This build worker requires Dockerfile in the selected root directory.",
        );
    }
    if (config.database.mode === "existing") {
      const d = (
        await db.query(
          "SELECT d.state,b.cluster_id FROM webdock_auth.hosting_database d JOIN webdock_auth.hosting_database_backend b ON b.id=d.backend_id WHERE d.id=$1 AND d.project_id=$2 AND d.customer_id=$3",
          [config.database.databaseID, input.projectID, access.customerID],
        )
      ).rows[0];
      if (
        !d ||
        d.cluster_id !== access.project.cluster_id ||
        d.state !== "ready"
      )
        result.blockers.push(
          "Choose a ready database in the same project and cluster.",
        );
    }
    if (config.mail) {
      try {
        applicationMailRoute();
      } catch (error) {
        result.blockers.push((error as HostingError).message);
      }
      const domain = (
        await db.query(
          "SELECT 1 FROM webdock_auth.mail_connection c JOIN webdock_auth.mail_connection_domain b ON b.connection_id=c.id JOIN webdock_auth.mail_sender_domain d ON d.id=b.domain_id WHERE c.id=$1 AND c.customer_id=$2 AND c.state='ready' AND c.deleted_at IS NULL AND d.id=$3 AND d.customer_id=c.customer_id AND d.status='ownership_verified' AND d.deleted_at IS NULL",
          [config.mail.connectionID, access.customerID, config.mail.domainID],
        )
      ).rowCount;
      if (!domain)
        result.blockers.push(
          "Verify a native Mail connection and sender domain first.",
        );
    }
  });
  if (config.database.mode === "new" && !input.databaseID)
    try {
      const offer = await executeDatabaseCommand(actor, {
        action: "databases.offers.create",
        projectID: input.projectID,
        planRevisionID: config.database.planRevisionID,
        name: config.database.name,
        idempotencyKey: "setup-offer-" + result.id,
      });
      result.offers.push({
        id: offer.id,
        name: offer.name,
        monthlyPriceCents: offer.snapshot.monthlyPriceCents,
        currency: offer.snapshot.currency,
        terms: offer.snapshot.terms,
        expiresAt: offer.expiresAt,
        backupStatus: offer.snapshot.backupStatus,
      });
      result.expiresAt = new Date(
        Math.min(
          new Date(result.expiresAt).getTime(),
          new Date(offer.expiresAt).getTime(),
        ),
      ).toISOString();
    } catch (error) {
      result.blockers.push(
        error instanceof HostingError
          ? error.message
          : "Database offer is unavailable.",
      );
    }
  return result;
}
