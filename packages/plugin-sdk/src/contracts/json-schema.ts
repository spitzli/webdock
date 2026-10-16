import { z } from "zod";
import { extensionSchema } from "./manifest.js";
/** Registry shape validation supplements, never replaces, host semantic validation. */
export function tabulariumKindSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(extensionSchema, {
    target: "draft-7",
    unrepresentable: "throw",
    reused: "inline",
  });
  const required = new Set(schema.required ?? []);
  return Object.fromEntries(
    Object.entries(schema.properties ?? {}).map(([name, property]) => [
      name,
      {
        // Tabularium consumes required:true at the field boundary. Keep nested
        // required arrays inside allOf so object requirements remain intact.
        ...(typeof property === "object" && property.type ? { type: property.type } : {}),
        allOf: [property],
        required: required.has(name),
      },
    ]),
  );
}
