import { test } from "node:test";
import assert from "node:assert/strict";
import { studioError, PluginSourceError } from "./studio-errors";
test("reviewed installer errors retain their public type and status", () => {
  const error = studioError(
    "PluginSourceError",
    "Approve exactly the declared permissions.",
    400,
  );
  assert.ok(error instanceof PluginSourceError);
  assert.equal(error.status, 400);
  assert.equal(error.message, "Approve exactly the declared permissions.");
  assert.ok(
    !(
      studioError("UnexpectedProviderError", "internal", 503) instanceof
      PluginSourceError
    ),
  );
});
