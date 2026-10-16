import {
  storedConsoleIdentity,
  withStoredConsolePrincipal,
} from "../auth/principal";
import { revalidateStoredConsoleIdentity } from "../auth/clerk-provider";
import { createDatabaseService } from "@webdock/module-databases/server/service";
import { authorizeHosting } from "../hosting/authorization";
import { audit as hostingAudit } from "../hosting/db";
import { encryptMailSecret, decryptMailSecret } from "../platform/platform";
/** Existing API entrypoints retain their signatures and transaction composition. */
export const { executeDatabase, exchangeLaunch, inspectSession } =
  createDatabaseService({
    storedConsoleIdentity,
    async withStoredIdentity(reference, run) {
      const principal = await revalidateStoredConsoleIdentity(reference);
      return withStoredConsolePrincipal(principal, () => run(principal));
    },
    authorizeHosting,
    hostingAudit,
    encryptMailSecret,
    decryptMailSecret,
    gatewayOrigin: () => process.env.WEBDOCK_DATABASE_GATEWAY_ORIGIN,
  });
