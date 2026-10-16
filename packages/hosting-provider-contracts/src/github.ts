export type GitHubConfig = {
  appID: string;
  privateKey: string;
  clientID: string;
  clientSecret: string;
};

export type GitRepositoryBinding = {
  installationID: string;
  repositoryID: string;
  accountID: string;
  accountLogin: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  permissions: Record<string, string>;
};

export type GitSource = {
  installationID: string;
  repositoryID: string;
  branch: string;
};

export type GitHubWebhook =
  | {
      deliveryID: string;
      event: "workflow_run";
      installationID: string;
      repositoryID: string;
      branch: string;
      sha: string;
      runID: string;
      runAttempt: number;
      workflowPath: string;
      conclusion: string;
      action: string;
    }
  | {
      deliveryID: string;
      event: "push";
      installationID: string;
      repositoryID: string;
      branch: string;
      sha: string;
      deleted: boolean;
    }
  | {
      deliveryID: string;
      event: "installation" | "installation_repositories" | "repository";
      installationID: string;
      action: string;
      repositoryIDs: string[];
    };
export type GitHubProvider = {
  listUserInstallations: (
    userToken: string,
  ) => Promise<
    { installationID: string; accountID: string; accountLogin: string }[]
  >;
  listUserRepositories: (
    userToken: string,
    installationID: string,
  ) => Promise<
    {
      repositoryID: string;
      owner: string;
      name: string;
      fullName: string;
      defaultBranch: string;
    }[]
  >;
  verifyRepository: (
    userToken: string,
    installationID: string,
    repositoryID: string,
  ) => Promise<GitRepositoryBinding>;
  revalidateRepository: (
    installationID: string,
    repositoryID: string,
  ) => Promise<{
    repositoryID: string;
    owner: string;
    name: string;
    fullName: string;
    defaultBranch: string;
  }>;
  resolveSource: (source: GitSource) => Promise<{
    sha: string;
    repositoryID: string;
    repositoryName: string;
    branch: string;
  }>;
  resolveCommit: (
    source: GitSource,
    commit: string,
  ) => Promise<{
    sha: string;
    repositoryID: string;
    repositoryName: string;
    branch: string;
  }>;
  readSourceFile: (
    source: GitSource,
    commit: string,
    path: string,
  ) => Promise<string | null>;
  exchangeOAuthCode: (code: string, redirectURI: string) => Promise<string>;
  fetchSource: (
    installationID: string,
    repositoryID: string,
    revision: string,
  ) => Promise<{
    bytes: Buffer<ArrayBufferLike>;
    sha: string;
    repositoryID: string;
    repositoryName: string;
    checksum: string;
  }>;
  prepareSourceDownload: (
    installationID: string,
    repositoryID: string,
    revision: string,
  ) => Promise<{
    url: string;
    sha: string;
    repositoryID: string;
    repositoryName: string;
  }>;
  reportCheck: (input: {
    installationID: string;
    repositoryID: string;
    sha: string;
    externalID: string;
    checkID?: string;
    status: "queued" | "in_progress" | "completed";
    conclusion?: "success" | "failure" | "cancelled" | "neutral";
  }) => Promise<{ checkID: string }>;
  verifyActionsRun: (input: {
    installationID: string;
    repositoryID: string;
    workflowPath: string;
    runID: string;
    runAttempt: number;
    branch: string;
    sha: string;
    artifactName: string;
  }) => Promise<{
    runID: string;
    runAttempt: number;
    workflowID: string;
    workflowPath: string;
    repositoryID: string;
    sha: string;
    branch: string;
    createdAt: string;
    artifact: {
      id: string;
      name: string;
      sizeBytes: number;
      digest: string;
      downloadURL: string;
      repository: string;
      ref: string;
      runID: string;
      runAttempt: number;
      workflowPath: string;
      repositoryID: string;
    };
  }>;
};
