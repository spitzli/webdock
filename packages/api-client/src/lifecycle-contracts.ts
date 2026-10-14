export type ProjectDeletionView = {
  plan: {
    projectID: string;
    name: string;
    customerID: string;
    origin: string;
    instanceID: string;
    schema: string;
    bindingID: string;
    providerProjectID: string;
    teamID: string;
    registryHash: string;
    databaseConfigHash: string;
    identity: {
      bindingID: string;
      customerID: string;
      origin: string;
      clientID: string;
      organizationID: string;
      label: string;
      planHash: string;
      alreadyRemoved: boolean;
    };
  };
  planHash: string;
  status: string;
  completedSteps: string[];
  lastError: string | null;
};
