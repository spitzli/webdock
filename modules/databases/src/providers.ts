export type { DatabaseConfig } from "@webdock/database-runtime";

export type DatabaseWorkspaceTarget =
  | {
      kind: "customer-binding";
      bindingID: string;
      customerID: string;
      projectID: string;
    }
  | {
      kind: "managed-customer";
      databaseID: string;
      customerID: string;
      projectID: string;
    }
  | { kind: "platform"; key: "metadata" };
