import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tabulariumKindSchema } from "../src/contracts/index.ts";
test("registry schema has no remote refs and matches generated contract", () => {
  const schema = tabulariumKindSchema();
  assert.deepEqual(
    schema,
    JSON.parse(
      readFileSync(
        new URL(
          "../../../tools/plugins/tabularium-kind.schema.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  assert.equal(JSON.stringify(schema).includes('"$ref"'), false);
  assert.equal(Object.hasOwn(schema, "x-webdock"), false);
  for (const field of ["image", "capabilities", "actions", "configuration"])
    assert.equal((schema[field] as { required: boolean }).required, true);
});

test('optional registry fields omit the required marker instead of emitting invalid JSON Schema',()=>{
 const schema=tabulariumKindSchema();assert.equal(Object.hasOwn(schema.api as object,'required'),false);assert.equal(Object.hasOwn(schema.mcp as object,'required'),false);
});
