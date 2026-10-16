import { z } from "zod";
import { extensionSchema } from "./manifest.js";
/** Registry shape validation supplements, never replaces, host semantic validation. */
export function tabulariumKindSchema(): Record<string, unknown> {
  const { $schema, ...schema } = z.toJSONSchema(extensionSchema, {
    target: "draft-7",
    unrepresentable: "throw",
    reused: "inline",
  });
  // Tabularium uses required:true on an extension property. Keep the inner
  // object's required array in allOf so the registry does not strip it.
  return { "x-webdock": { allOf: [schema], required: true } };
}
