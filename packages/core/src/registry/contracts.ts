import { z } from "zod";
export const recordID = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine(
    (v) => /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n,
    "Invalid ID",
  );
export const collectionName = z.enum(["customers", "projects", "audit-events"]);
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
export const listInput = z
  .object({
    collection: z.string().min(1).max(80),
    search: z.string().trim().max(160).optional(),
    page: z.number().int().min(1).max(10000).default(1),
    limit: z.number().int().min(1).max(50).default(20),
    status: z.string().max(80).optional(),
    customer: recordID.optional(),
    targetCollection: z.string().max(80).optional(),
    targetID: recordID.optional(),
    sort: z.string().max(80).default("-updatedAt"),
  })
  .strict();
