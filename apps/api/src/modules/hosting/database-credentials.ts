import { withHostingDatabase } from "../../db/database-context";
import { HostingError, type HostingActor } from "@webdock/hosting-contracts";
import { transaction, audit } from "./db";
import { authorizeHosting } from "./authorization";
import { databaseAccess } from "./databases";
import { decryptMailSecret } from "../platform/platform";
export async function displayDatabaseCredentials(
  actor: HostingActor,
  databaseID: string,
) {
  return withHostingDatabase(actor, async () => {
    if (actor.source !== "studio")
      throw new HostingError(403, "Open database credentials in Studio.");
    return transaction(async (db) => {
      const d = await databaseAccess(db, actor, databaseID, true);
      await authorizeHosting(
        actor,
        { permission: "org:databases:manage", projectID: d.project_id, write: true, tenantAdmin: true, live: true },
        db,
      );
      if (
        !["ready", "paused"].includes(d.state) ||
        !d.confirmed_credentials_encrypted ||
        d.confirmed_credential_revision !== d.credential_revision
      )
        throw new HostingError(
          409,
          "Confirmed database credentials are not available yet.",
        );
      const backend = (
        await db.query(
          "SELECT host,direct_port,pooled_port,endpoint_ready,ca_certificate FROM webdock_auth.hosting_database_backend WHERE id=$1",
          [d.backend_id],
        )
      ).rows[0];
      if (
        !backend ||
        (!backend.endpoint_ready && d.state !== "paused") ||
        !backend.ca_certificate
      )
        throw new HostingError(
          409,
          "Verified database connection details are not available yet.",
        );
      const secret = decryptMailSecret<{
        applicationPassword: string;
        migrationPassword: string;
      }>(
        d.confirmed_credentials_encrypted,
        `database:${d.id}:${d.confirmed_credential_revision}`,
      );
      await audit(db, actor, "databases.credentials.display", d.id);
      return {
        databaseID: d.id,
        databaseName: d.database_name,
        host: backend.host,
        directPort: backend.direct_port,
        pooledPort: backend.pooled_port,
        credentialRevision: d.confirmed_credential_revision,
        application: {
          username: "wd_app_" + d.id,
          password: secret.applicationPassword,
        },
        migration: {
          username: "wd_migrate_" + d.id,
          password: secret.migrationPassword,
        },
        sslmode: "verify-full",
        caCertificate: backend.ca_certificate,
      };
    });
  });
}
