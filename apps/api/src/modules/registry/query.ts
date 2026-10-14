import {
  and,
  or,
  eq,
  ne,
  inArray,
  notInArray,
  ilike,
  isNull,
  isNotNull,
  sql,
  type SQL,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { RegistryError } from "./service";
export function whereQuery(
  value: unknown,
  columns: Record<string, AnyPgColumn>,
  depth = 0,
  budget = { nodes: 0 },
): SQL | undefined {
  if (value === undefined) return;
  if (
    ++budget.nodes > 100 ||
    depth > 6 ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length > 20
  )
    throw new RegistryError("Invalid registry filter.");
  const clauses: SQL[] = [];
  for (const [field, condition] of Object.entries(value)) {
    if (field === "and" || field === "or") {
      if (!Array.isArray(condition) || condition.length > 20)
        throw new RegistryError("Invalid registry filter.");
      const children = condition.map((child) =>
        whereQuery(child, columns, depth + 1, budget)!,
      );
      clauses.push(
        (field === "and" ? and(...children) : or(...children)) ||
          (field === "and" ? sql`true` : sql`false`),
      );
      continue;
    }
    const column = Object.hasOwn(columns, field) ? columns[field] : undefined;
    if (
      !column ||
      !condition ||
      typeof condition !== "object" ||
      Array.isArray(condition) ||
      Object.keys(condition).length !== 1
    )
      throw new RegistryError("Invalid registry filter.");
    const [operator, input] = Object.entries(condition)[0];
    const scalar = (v: unknown) =>
      v === null ||
      (typeof v === "string" && v.length <= 3000) ||
      (typeof v === "number" && Number.isFinite(v)) ||
      typeof v === "boolean";
    if (operator === "exists" && typeof input === "boolean") {
      clauses.push(input ? isNotNull(column) : isNull(column));
      continue;
    }
    if (
      ["in", "not_in"].includes(operator) &&
      Array.isArray(input) &&
      input.length <= 100 &&
      input.every(scalar)
    ) {
      clauses.push(
        operator === "in" ? inArray(column, input) : notInArray(column, input),
      );
      continue;
    }
    if (!scalar(input)) throw new RegistryError("Invalid filter value.");
    if (operator === "equals")
      clauses.push(input === null ? isNull(column) : sql`${column} = ${input}`);
    else if (operator === "not_equals")
      clauses.push(
        input === null ? isNotNull(column) : sql`${column} <> ${input}`,
      );
    else if (operator === "contains" && typeof input === "string")
      clauses.push(ilike(column, "%" + input.replace(/[\\%_]/g, "\\$&") + "%"));
    else throw new RegistryError("Unsupported registry filter.");
  }
  return and(...clauses);
}
