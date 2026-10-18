/** Public installer protocol. Never add credentials or source archive bytes to status views. */
export type PluginSource =
  | { kind: "zip"; name: string; size: number }
  | {
      kind: "git";
      url: string;
      ref?: string;
      credential?: { username: string; token: string };
    }
  | {
      kind: "github";
      installation: number;
      installationPage: number;
      page: number;
      repository: number;
      ref?: string;
    };
export type PluginImportStatus =
  | "uploading"
  | "queued"
  | "building"
  | "review"
  | "approved"
  | "deploying"
  | "ready"
  | "enabled"
  | "failed";
export type PluginImport = {
  id: string;
  projectID: string;
  status: PluginImportStatus;
  source: {
    kind: PluginSource["kind"];
    label: string;
    commit?: string;
    sha256?: string;
  };
  mode: "build";
  uploadedBytes: number;
  expectedBytes: number;
  manifest?: {
    name: string;
    version: string;
    description?: string;
    image: string;
    capabilities: string[];
    configuration: Record<string, unknown>;
  };
  manifestSha256?: string;
  error?: string;
  createdAt: string;
};
export type PluginSourceCommand =
  | { action: "list"; projectID: string }
  | {
      action: "create";
      projectID: string;
      source: PluginSource;
      mode: "build";
      idempotencyKey: string;
    }
  | { action: "chunk"; id: string; offset: number; data: string }
  | { action: "submit"; id: string }
  | { action: "discard"; id: string }
  | {
      action: "approve";
      id: string;
      manifestSha256: string;
      capabilities: string[];
      configuration: Record<string, unknown>;
    }
  | { action: "activate"; id: string };
export type PluginSourceView = { configured: boolean; imports: PluginImport[] };
