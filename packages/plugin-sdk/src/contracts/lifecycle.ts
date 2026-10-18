import type { PluginManifest, PluginDependency } from "./manifest.js";
export type Availability = "enabled" | "draining" | "disabled";
export type Intent = "read" | "write" | "provision" | "continue";
export type Revision = string;
export type PluginID = string;
export type PluginScope = { customerID: string; projectID: string };
export type SessionActor = { subject: string; sessionID: string };
export type Mutation = { expectedRevision: Revision; idempotencyKey: string };
export type Blocker = { code: string; message: string; count?: number };
export type OperationRef = {
  id: string;
  status: "pending" | "running" | "succeeded" | "failed" | "blocked";
};
export type InstalledPlugin = {
  id: PluginID;
  kind: "builtin" | "external";
  revision: Revision;
  desiredState: Availability;
  state: Availability;
  version: string;
  imageDigest: string | null;
  runtime: "absent" | "starting" | "ready" | "stopped" | "failed";
  blockers: Blocker[];
  dependencies?: readonly PluginDependency[];
};

export type OperatorActor = SessionActor;
export type PluginTarget = { kind: "builtin" | "external"; id: PluginID };
export type VerifiedPluginRelease = {
  registryURL: string;
  id: PluginID;
  version: string;
  manifestBytes: string;
  manifestSha256: string;
  image: string;
  signerKeyID: string;
  manifest: PluginManifest;
};
