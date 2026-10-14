import { z } from "zod";
export const recordID = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine(
    (v) => /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n,
    "Invalid ID",
  );
export const collectionName = z.enum([
  "customers",
  "projects",
  "cms-instances",
  "audit-events",
]);
const text = z.string().trim().max(160);
const optionalText = text.nullable().optional();
const notes = z.string().trim().max(3000).nullable().optional();
const url = z
  .string()
  .url()
  .refine((v) => {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  }, "Use an HTTPS URL without credentials")
  .nullable()
  .optional();
export const customerInput = z
  .object({
    name: text.min(1),
    customerType: z.enum(["person", "company"]).optional(),
    firstName: optionalText,
    lastName: optionalText,
    companyName: optionalText,
    contactName: optionalText,
    contactEmail: z.string().trim().max(254).email().nullable().optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    addressLine1: optionalText,
    addressLine2: optionalText,
    postalCode: z.string().trim().max(32).nullable().optional(),
    city: optionalText,
    region: optionalText,
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Use a two-letter ISO country code")
      .nullable()
      .optional(),
    notes,
  })
  .strict();
export const projectInput = z
  .object({
    name: text.min(1),
    customer: recordID,
    url,
    repositoryURL: url,
    notes,
  })
  .strict();
export const instanceInput = z
  .object({
    project: recordID,
    label: text.min(1),
    adminURL: url.unwrap().unwrap(),
    schemaName: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),
    providerProjectID: text.min(1),
    provider: z.enum(["vercel", "other"]),
    template: z.enum([
      "webdock-landing",
      "spitzli-portfolio",
      "stall-business",
      "custom",
    ]),
    payloadVersion: z.string().max(64).nullable().optional(),
    status: z.enum(["active", "suspended", "retired"]),
    notes,
  })
  .strict();
export const listInput = z
  .object({
    collection: collectionName,
    search: z.string().trim().max(160).optional(),
    page: z.number().int().min(1).max(10000).default(1),
    limit: z.number().int().min(1).max(50).default(20),
    status: z.enum(["active", "archived", "suspended", "retired"]).optional(),
    customer: recordID.optional(),
    project: recordID.optional(),
    targetCollection: z
      .enum(["customers", "projects", "cms-instances"])
      .optional(),
    targetID: recordID.optional(),
    sort: z
      .enum([
        "name",
        "-name",
        "label",
        "-label",
        "-updatedAt",
        "-createdAt",
        "createdAt",
      ])
      .default("-updatedAt"),
  })
  .strict();
