/** Existing provider capabilities; Kubernetes execution stays behind the enrolled agent protocol. */
export type VercelDeploymentStatus =
  | "QUEUED"
  | "INITIALIZING"
  | "BUILDING"
  | "READY"
  | "ERROR"
  | "CANCELED"
  | "BLOCKED"
  | "UNKNOWN";
export type VercelDeployment = {
  id: string;
  status: VercelDeploymentStatus;
  url: string | null;
  target: string | null;
  createdAt: string | null;
  readyAt: string | null;
  branch: string | null;
  commitSHA: string | null;
  commitMessage: string | null;
};
export type VercelDomain = {
  name: string;
  verified: boolean;
  redirect: string | null;
};
export type VercelProjectSnapshot = {
  projectID: string;
  name: string;
  framework: string | null;
  nodeVersion: string | null;
  checkedAt: string;
  productionDeployment?: VercelDeployment;
  deployments: VercelDeployment[];
  domains: VercelDomain[];
};
export type VercelAPIErrorCode =
  | "unavailable"
  | "disconnected"
  | "forbidden"
  | "not_found"
  | "deletion_forbidden";

export type VercelJSONTransport = (
  path: string,
  token?: string,
  teamID?: string,
  init?: RequestInit,
) => Promise<Record<string, unknown>>;
export class HostingProviderError extends Error {
  constructor(
    public readonly status: 400 | 403 | 502,
    message: string,
  ) {
    super(message);
    this.name = "HostingProviderError";
  }
}
export type HostingDeploymentBoundary =
  | {
      provider: "kubernetes";
      execution: "enrolled-agent";
      credentials: "node-local";
      protocol: "webdock-hosting-agent-v1";
    }
  | {
      provider: "vercel";
      execution: "server-http";
      credentials: "bound-integration";
      origin: "https://api.vercel.com";
    };
export const hostingDeploymentBoundaries: readonly HostingDeploymentBoundary[] =
  [
    {
      provider: "kubernetes",
      execution: "enrolled-agent",
      credentials: "node-local",
      protocol: "webdock-hosting-agent-v1",
    },
    {
      provider: "vercel",
      execution: "server-http",
      credentials: "bound-integration",
      origin: "https://api.vercel.com",
    },
  ];
