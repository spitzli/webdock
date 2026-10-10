import { z } from "zod";
const bytes = (s: string) => new TextEncoder().encode(s).length;
export const environmentNameSchema = z
  .string()
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
  .refine((n) => !["__proto__", "constructor", "prototype"].includes(n));
export const environmentValueSchema = z
  .string()
  .refine((v) => !v.includes("\0") && bytes(v) <= 4096);
export const environmentPatchSchema = z
  .array(
    z
      .object({
        name: environmentNameSchema,
        value: environmentValueSchema.nullable(),
      })
      .strict(),
  )
  .max(32)
  .refine(
    (rows) => new Set(rows.map((r) => r.name)).size === rows.length,
    "Duplicate environment variable names.",
  )
  .refine(
    (rows) =>
      rows.reduce((n, r) => n + bytes(r.name) + bytes(r.value ?? ""), 0) <=
      12000,
    "Environment variables are too large.",
  )
  .refine(
    (rows) =>
      bytes(
        JSON.stringify(
          Object.fromEntries(
            rows.filter((r) => r.value !== null).map((r) => [r.name, r.value]),
          ),
        ),
      ) <= 16000,
    "Environment variables are too large.",
  );
export type EnvironmentPatch = z.infer<typeof environmentPatchSchema>;
