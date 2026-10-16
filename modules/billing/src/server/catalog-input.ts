import { z } from "zod";
import { amountSchema, entitlementsSchema } from "./types";
export const productVersionInput = z
  .object({
    sku: z.string().regex(/^[a-z][a-z0-9-]{2,79}$/),
    name: z.string().trim().min(1).max(160),
    family: z
      .enum([
        "website",
        "apps",
        "connect",
        "mail",
        "media",
        "editors",
        "database",
        "service",
      ])
      .default("website"),
    visibility: z.enum(["public", "private", "internal"]),
    operationallyReady: z.boolean(),
    amount: amountSchema.nullable(),
    currency: z.enum(["EUR", "CHF"]),
    taxBehavior: z.enum(["inclusive", "exclusive"]),
    interval: z.enum(["month", "year", "once"]),
    description: z.string().trim().min(1).max(4000),
    terms: z.string().trim().min(1).max(8000),
    entitlements: z.union([
      entitlementsSchema,
      z.object({ kind: z.literal("manual") }).strict(),
    ]),
  })
  .strict()
  .superRefine((value, context) => {
    const website = value.family === "website";
    if (
      website &&
      (value.amount === null ||
        value.interval === "once" ||
        !entitlementsSchema.safeParse(value.entitlements).success)
    )
      context.addIssue({
        code: "custom",
        message:
          "Website versions require a fixed recurring price and website entitlements.",
      });
    if (!website && !("kind" in value.entitlements))
      context.addIssue({
        code: "custom",
        message: "Other product families require manual fulfillment.",
      });
  });
