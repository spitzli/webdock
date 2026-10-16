import { selectedIdentityDirectory } from "../auth/principal";
import { createHostingAuthorization } from "@webdock/module-hosting/server/authorization";
import { currentDatabaseScope } from "@webdock/database-runtime";
export type { Connection } from "@webdock/module-hosting/server/authorization";
export const { authorizeHosting } = createHostingAuthorization({
  identity: selectedIdentityDirectory,
  get currentDatabaseScope() {
    return currentDatabaseScope;
  },
});
