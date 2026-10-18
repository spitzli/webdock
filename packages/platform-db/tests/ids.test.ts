import { test } from "node:test";
import assert from "node:assert/strict";
import { recordID } from "../src/ids";
test("shared platform identities preserve exact decimal Snowflakes and reject coercion/overflow", () => {
  assert.equal(recordID.parse("9223372036854775807"), "9223372036854775807");
  for (const bad of ["9223372036854775808", "0", "01", "1e12", 123])
    assert.throws(() => recordID.parse(bad));
});
