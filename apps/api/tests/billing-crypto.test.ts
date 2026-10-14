import { test, expect } from "bun:test";
import { sealBilling, openBilling } from "../src/modules/billing/crypto";
const root = "fixture-existing-root-key-at-least-32-characters";
test("billing encryption binds environment, kind and version without changing the existing root", () => {
  const ciphertext = sealBilling(
    { token: "never-public" },
    "sandbox",
    "token",
    1,
    root,
  );
  expect(ciphertext).not.toContain("never-public");
  expect(
    openBilling<{ token: string }>(ciphertext, "sandbox", "token", 1, root),
  ).toEqual({ token: "never-public" });
  for (const [env, kind, version] of [
    ["live", "token", 1],
    ["sandbox", "webhook", 1],
    ["sandbox", "token", 2],
  ] as const)
    expect(() => openBilling(ciphertext, env, kind, version, root)).toThrow();
  expect(() =>
    openBilling(ciphertext.slice(0, -4) + "aaaa", "sandbox", "token", 1, root),
  ).toThrow();
});
test("encrypted durable webhook body supports the full bounded payload size", () => {
  const value = "x".repeat(1_048_576),
    sealed = sealBilling(value, "sandbox", "event", 1, root);
  expect(openBilling<string>(sealed, "sandbox", "event", 1, root)).toBe(value);
});
