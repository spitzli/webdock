import { environmentPatchSchema } from "./environment";
import { z } from "zod";
const id = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine(
    (v) => /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n,
  );
const revision = z.number().int().min(0).max(2147483646);
const key = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
export const gitRootDirectory = z
  .string()
  .max(240)
  .refine(
    (v) =>
      v === "." ||
      (/^[A-Za-z0-9_.\/-]+$/.test(v) &&
        v.split("/").every((p) => p !== "" && p !== "." && p !== "..")),
  );
export const gitBranch = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_][A-Za-z0-9_.\/-]*$/)
  .refine(
    (v) =>
      !v.includes("..") &&
      !v.includes("//") &&
      !v.endsWith("/") &&
      !v.endsWith(".lock"),
  );
const page = {
  page: z.number().int().min(1).max(100000).default(1),
  limit: z.number().int().min(1).max(100).default(25),
};
export const gitCommands = [
  z
    .object({
      action: z.literal("git.targets.bind"),
      projectID: id,
      targetID: z.string().regex(/^prj_[A-Za-z0-9]+$/),
      mode: z.enum(["byok", "platform"]),
    })
    .strict(),
  z
    .object({ action: z.literal("git.connections.list"), customerID: id })
    .strict(),
  z
    .object({
      action: z.literal("git.connections.disconnect"),
      customerID: id,
      connectionID: id,
      revision,
    })
    .strict(),
  z
    .object({
      action: z.literal("git.repositories.list"),
      customerID: id,
      connectionID: id,
    })
    .strict(),
  z.object({ action: z.literal("git.source.get"), projectID: id }).strict(),
  z
    .object({
      action: z.literal("git.source.configure"),
      projectID: id,
      connectionID: id,
      repositoryID: id,
      branch: gitBranch,
      rootDirectory: gitRootDirectory,
      recipe: z.enum(["dockerfile", "vercel"]),
      targetID: z.string().regex(/^(?:[1-9][0-9]{0,18}|prj_[A-Za-z0-9]+)$/),
      revision,
      enabled: z.boolean().default(true),
      autoPublish: z.boolean().default(false),
      buildEnvironment: environmentPatchSchema.optional(),
    })
    .strict(),
  z
    .object({ action: z.literal("git.builds.list"), projectID: id, ...page })
    .strict(),
  z
    .object({ action: z.literal("git.builds.get"), projectID: id, buildID: id })
    .strict(),
  z
    .object({
      action: z.literal("git.builds.request"),
      projectID: id,
      idempotencyKey: key,
    })
    .strict(),
  z
    .object({
      action: z.literal("git.builds.cancel"),
      projectID: id,
      buildID: id,
    })
    .strict(),
  z
    .object({ action: z.literal("git.releases.list"), projectID: id, ...page })
    .strict(),
  z
    .object({
      action: z.literal("git.releases.approve"),
      projectID: id,
      releaseID: id,
      revision,
      idempotencyKey: key,
    })
    .strict(),
  z
    .object({
      action: z.literal("git.releases.reconcile"),
      projectID: id,
      releaseID: id,
      revision,
    })
    .strict(),
  z
    .object({
      action: z.literal("git.releases.rollback"),
      projectID: id,
      releaseID: id,
      revision,
      idempotencyKey: key,
    })
    .strict(),
] as const;
export const gitCommandSchema = z.discriminatedUnion("action", gitCommands);
export type GitDeploymentCommand = z.infer<typeof gitCommandSchema>;
export const gitReadActions = [
  "git.connections.list",
  "git.repositories.list",
  "git.source.get",
  "git.builds.list",
  "git.builds.get",
  "git.releases.list",
] as const;
