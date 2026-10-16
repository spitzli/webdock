/** Platform metadata PostgreSQL pools. Customer database bindings never reuse these credentials. */
export type DatabaseConfig = {
  environment: "production" | "development" | "test";
  businessURL: string;
  authURL: string;
  workerURL: string;
  signingSecret?: string;
  ca?: string;
  max: number;
};

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
