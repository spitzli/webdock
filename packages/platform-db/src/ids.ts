import { z } from "zod";
/** Decimal Snowflake identity preserved as a string, never coerced through a JS number. */
export const recordID = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine(
    (value) =>
      /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n,
    "Invalid ID",
  );
