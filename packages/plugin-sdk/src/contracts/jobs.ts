import { z } from "zod";
import { pluginLimits } from "./capabilities.js";
export const jobNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_.-]*$/);
export const jobIDSchema = z.string().regex(/^job-[a-f0-9]{64}$/);
export const enqueueJobSchema = z.strictObject({
  name: jobNameSchema,
  payload: z
    .json()
    .refine(
      (value) =>
        new TextEncoder().encode(JSON.stringify(value)).byteLength <=
        pluginLimits.jobPayloadBytes,
      "Job payload exceeds 32 KiB",
    ),
  idempotencyKey: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9_.-]+$/),
  delaySeconds: z
    .number()
    .int()
    .min(0)
    .max(pluginLimits.jobDelaySeconds)
    .default(0),
  attempts: z.number().int().min(1).max(5).default(3),
});
export type EnqueueJob = z.input<typeof enqueueJobSchema>;
export type JobStatus = {
  id: string;
  name: string;
  state:
    "waiting" | "delayed" | "active" | "completed" | "failed" | "cancelled";
  attempts: number;
  result?: unknown;
};
export type PluginJobs = {
  enqueue(input: EnqueueJob): Promise<{ id: string }>;
  get(id: string): Promise<JobStatus>;
  cancel(id: string): Promise<{ id: string; cancelRequested: true }>;
};
