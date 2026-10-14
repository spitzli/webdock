import { z } from "zod";
export const environmentSchema = z.enum(["sandbox", "live"]);
export type BillingEnvironment = z.infer<typeof environmentSchema>;
export const revisionSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,18})$/)
  .transform(BigInt);
export const amountSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
export const entitlementsSchema = z
  .object({
    websites: z.literal(1),
    editors: z.number().int().positive().max(1000),
    mediaBytes: z
      .string()
      .regex(/^[1-9]\d{0,15}$/)
      .refine((value) => BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER)),
    mailMonthly: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export const apiVersion = "2026-10" as const;
export const webhookEvents = [
  "customer.state_changed",
  "subscription.created",
  "subscription.updated",
  "order.paid",
  "order.refunded",
  "checkout.updated",
  "checkout.expired",
  "product.updated",
] as const;
export class BillingError extends Error {
  readonly isPublic = true;
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
