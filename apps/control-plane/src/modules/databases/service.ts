import { createDatabaseService } from "@webdock/module-databases/server/service";
import { authorizeHosting } from "../hosting/authorization";
import { audit as hostingAudit } from "../hosting/db";
import { encryptMailSecret, decryptMailSecret } from "../platform/platform";
/** Existing API entrypoints retain their signatures and transaction composition. */
export const { executeDatabase, exchangeLaunch, inspectSession } =
  createDatabaseService({
    authorizeHosting,
    hostingAudit,
    encryptMailSecret,
    decryptMailSecret,
    gatewayOrigin: () => process.env.WEBDOCK_DATABASE_GATEWAY_ORIGIN,
  });
