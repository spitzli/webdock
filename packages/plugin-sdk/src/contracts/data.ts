import { z } from "zod";
export const documentKeySchema = z
  .string()
  .min(1)
  .max(240)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
export const documentWriteSchema = z.strictObject({
  key: documentKeySchema,
  value: z
    .json()
    .refine(
      (v) => new TextEncoder().encode(JSON.stringify(v)).length <= 64 * 1024,
      "Document exceeds 64 KiB",
    ),
  expectedRevision: z
    .string()
    .regex(/^(0|[1-9][0-9]{0,18})$/)
    .nullable(),
  idempotencyKey: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9_.-]+$/),
});
export type PluginDocument = { value: unknown; revision: string | null };
export type DocumentWrite = z.infer<typeof documentWriteSchema>;
export type PluginData = {
  read(key: string): Promise<PluginDocument>;
  write(input: DocumentWrite): Promise<PluginDocument>;
};
