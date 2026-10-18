import {
  currentDatabaseScope,
  withDatabaseScope,
  type DatabaseScope,
} from "@webdock/database-runtime";
import { database, workerDatabase } from "../../db/runtime";
import { currentRegistryActor } from "../integrations/operator";
import { RegistryError } from "../registry/service";
import { getGitHub } from "../integrations/github/client";
import { browserHeaders } from "../portal/request-context";
import { revalidateStoredConsoleIdentity } from "../auth/clerk-provider";
import { withConsolePrincipal } from "../auth/principal";
import { createPluginSourceService } from "./sources-store";
import { verifySourceRuntime } from "./sources-runtime";
import { sourceOperatorIdentity } from "./sources-identity";
import {
  installerConfigured,
  runtimeBindingSchema,
  sourceFail,
  type SourceRow,
} from "./sources-policy";
async function currentActor() {
  const actor = await currentRegistryActor().catch((error) => {
      if (error instanceof RegistryError && [401, 403].includes(error.status))
        sourceFail(
          "permission_denied",
          "A current operator session is required.",
          error.status,
        );
      throw error;
    }),
    scope = currentDatabaseScope();
  return sourceOperatorIdentity(actor, scope);
}
async function verifyActor(
  scope: Extract<DatabaseScope, { kind: "session" }>,
  projectID: string,
  customerID: string,
) {
  try {
    if (
      !scope ||
      scope.kind !== "session" ||
      !scope.subject ||
      !scope.sessionID
    )
      return false;
    const check = async () => {
      await currentRegistryActor();
      return (
        (
          await database.query(
            "SELECT 1 FROM webdock_admin.projects p JOIN webdock_admin.customers c ON c.id=p.customer_id WHERE p.id=$1 AND p.customer_id=$2 AND p.status='active' AND c.status='active' AND NOT EXISTS(SELECT 1 FROM webdock_admin.project_deletion d WHERE d.project_id=p.id AND d.status<>'deleted')",
            [projectID, customerID],
          )
        ).rows.length === 1
      );
    };
    if (scope.clerk) {
      const principal = await revalidateStoredConsoleIdentity({
        issuer: scope.clerk.issuer,
        userID: scope.clerk.userID,
        sessionID: scope.sessionID,
        organizationID: scope.clerk.clerkOrganizationID,
      });
      if (
        principal.userID !== scope.subject ||
        principal.sessionID !== scope.sessionID
      )
        return false;
      return withConsolePrincipal(principal, check);
    }
    return withDatabaseScope(scope, check);
  } catch {
    return false;
  }
}
async function probe(
  row: SourceRow,
  binding: ReturnType<typeof runtimeBindingSchema.parse>,
) {
  return verifySourceRuntime(
    row,
    binding,
    process.env.WEBDOCK_PLUGIN_RUNTIME_FILE!,
  );
}
const settings = {
  token: () => process.env.WEBDOCK_PLUGIN_INSTALLER_TOKEN ?? "",
  configured: () => installerConfigured(),
  actor: currentActor,
  verifyActor,
  probe,
};
const interactive = createPluginSourceService({
  ...settings,
  db: database,
  github: async (source, actorID) => {
    const actor = await currentRegistryActor();
    const { registryID } = sourceOperatorIdentity(
      actor,
      currentDatabaseScope(),
      actorID,
    );
    const github = getGitHub();
    if (!github)
      sourceFail(
        "github_unavailable",
        "Configure and connect GitHub before selecting a repository.",
        503,
      );
    return github.source(
      browserHeaders(),
      registryID,
      {
        installation: source.installation,
        installationPage: source.installationPage,
        page: source.page,
        repository: source.repository,
      },
      source.ref,
    );
  },
});
const installer = createPluginSourceService({
  ...settings,
  db: workerDatabase,
});
export const pluginSources = (input: unknown) => interactive.command(input);
export const pluginInstaller = (action: string, input: unknown) =>
  withDatabaseScope({ kind: "system", purpose: "plugin-controller" }, () =>
    installer.worker(action, input),
  );
