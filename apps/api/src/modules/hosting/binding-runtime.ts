import { currentDatabaseScope } from "@webdock/database-runtime";
import {
  HostingError,
  serviceRuntimeSchema,
  type ServiceRuntime,
} from "@webdock/hosting-contracts";
import { decryptMailSecret } from "../platform/platform";
import type { Connection } from "./authorization";
export type BindingMaterial = {
  environment: Record<string, string>;
  runtime: ServiceRuntime;
  credentialRevision: number;
};
export function openBinding(id: string, sealed: string): BindingMaterial {
  return decryptMailSecret<BindingMaterial>(sealed, "hosting-binding:" + id);
}
export async function bindingRuntime(
  db: Connection,
  appID: string,
  environment: Record<string, string>,
) {
  const rows = (
    await db.query(
      "SELECT * FROM webdock_auth.hosting_service_binding WHERE app_id=$1 AND state NOT IN ('disconnected','disconnecting') ORDER BY id FOR SHARE",
      [appID],
    )
  ).rows;
  const runtime: ServiceRuntime[] = [];
  for (const row of rows) {
    if (row.state === "blocked" || !row.secret_encrypted)
      throw new HostingError(
        409,
        "A connected service needs attention before deployment.",
      );
    const material = openBinding(row.id, row.secret_encrypted);
    for (const [name, value] of Object.entries(material.environment)) {
      if (environment[name] !== value)
        throw new HostingError(
          409,
          "Managed service variables cannot be edited manually.",
        );
    }
    if (row.service.kind === "postgres") {
      const current =
        currentDatabaseScope()?.kind === "system" &&
        process.env.DATABASE_RLS_SECRET
          ? (
              await db.query(
                "SELECT webdock_rls.binding_database_status($1) AS status",
                [row.id],
              )
            ).rows[0]?.status
          : (
              await db.query(
                "SELECT d.state,d.credential_revision,d.confirmed_credential_revision,b.ca_certificate,b.endpoint_ready FROM webdock_auth.hosting_database d JOIN webdock_auth.hosting_database_backend b ON b.id=d.backend_id WHERE d.id=$1 AND d.project_id=$2 AND d.customer_id=$3",
                [row.service.databaseID, row.project_id, row.customer_id],
              )
            ).rows[0];
      if (
        !current ||
        current.state !== "ready" ||
        !current.endpoint_ready ||
        current.credential_revision !== row.credential_revision ||
        current.confirmed_credential_revision !== row.credential_revision ||
        current.ca_certificate !== material.runtime.caCertificate
      )
        throw new HostingError(
          409,
          "Refresh the database connection before deployment.",
        );
    }
    runtime.push(
      serviceRuntimeSchema.parse({
        ...material.runtime,
        id: row.id,
        revision: row.revision,
      }),
    );
  }
  if (Buffer.byteLength(JSON.stringify(runtime)) > 32000)
    throw new HostingError(
      409,
      "Service certificates exceed the application configuration limit.",
    );
  return runtime;
}
