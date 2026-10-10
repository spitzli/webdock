import { z } from "zod";

// Confidential Studio bridge only: deliberately absent from public hosting commands.
const id = z.string().regex(/^[1-9][0-9]{0,18}$/);
const state = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const gitOAuthCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("git.oauth.begin"), customerID: id }).strict(),
  z
    .object({
      action: z.literal("git.oauth.exchange"),
      state,
      code: z.string().min(1).max(1024),
    })
    .strict(),
  z
    .object({
      action: z.literal("git.oauth.options"),
      state,
      installationID: id.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("git.oauth.finish"),
      state,
      installationID: id,
      repositoryID: id,
    })
    .strict(),
]);
export type GitOAuthCommand = z.infer<typeof gitOAuthCommandSchema>;
