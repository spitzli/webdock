/** Enrolled native agent protocol boundary; caller supplies authenticated generation and leases. */
export type MailAgent = {
  clusterID: string;
  generation: number;
  credentialHash: string;
};
export type MailAgentLease = {
  version: number;
  customerID: string;
  clusterID: string;
  operationID: string;
  revision: number;
  generation: number;
  leaseToken: string;
  leaseUntil: string | undefined;
  action: string;
  hostname: string;
  image: string;
  resources: {
    cpuMillicores: number;
    memoryBytes: number;
    volumeBytes: number;
    ephemeralBytes: number;
  };
  credentials: {
    bootstrapPassword?: string;
    username?: string;
    password?: string;
  };
};
export type MailConfigurationLease = {
  version: number;
  customerID: string;
  clusterID: string;
  operationID: string;
  generation: number;
  revision: string;
  leaseToken: string;
  leaseUntil: string;
  hostname: string;
  credentials: { username: string; password: string };
  domains: {
    id: string;
    name: string;
    providerId: string | null;
    ownershipVerified: boolean;
  }[];
  mailboxes: {
    id: string;
    domainId: string;
    localPart: string;
    quotaBytes: number;
    providerId: string | null;
  }[];
  identities: {
    username: string;
    password: string;
    id: string;
    subject: string;
    providerId: string | null;
    enabled: boolean;
    mailboxIds: string[];
  }[];
  submission: {
    transportRevision: string;
    resourceIDs: {
      accountID: string;
      hookID: string;
      routeID: string;
      tlsID: string;
      certificateID: string;
    } | null;
    relayHost: string;
    relayUsername: string;
    relayPassword: string;
    username: string;
    password: string;
    hookToken: string;
    customerID: string;
    hostname: string;
  } | null;
};
export interface MailAgentPorts {
  claimNativeMail(agent: MailAgent): Promise<MailAgentLease | null>;
  checkpointNativeMail(
    agent: MailAgent,
    input: unknown,
  ): Promise<{ leaseUntil: string }>;
  completeNativeMail(
    agent: MailAgent,
    input: unknown,
  ): Promise<{ completed: boolean }>;
  claimMailConfiguration(
    agent: MailAgent,
  ): Promise<MailConfigurationLease | null>;
  checkpointMailConfiguration(
    agent: MailAgent,
    input: unknown,
  ): Promise<{ leaseUntil: string }>;
  completeMailConfiguration(
    agent: MailAgent,
    input: unknown,
  ): Promise<{ completed: boolean; state: string }>;
}
