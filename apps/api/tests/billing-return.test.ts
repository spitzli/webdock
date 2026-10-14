import { test, expect } from "bun:test";
import { billingReturn } from "../src/protocols/billing-return";
test("checkout return retains sandbox identity and removes provider session tokens without granting service", () => {
  const response = billingReturn(
    "https://studio.webdock.dev",
    new Request(
      "https://studio.webdock.dev/api/billing/return?environment=sandbox&customerID=123&attemptID=456&customer_session_token=private-provider-token",
    ),
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    "https://studio.webdock.dev/tenants/123/billing?environment=sandbox&attempt=456",
  );
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.has("set-cookie")).toBe(false);
  expect(
    billingReturn(
      "https://studio.webdock.dev",
      new Request(
        "https://studio.webdock.dev/api/billing/return?environment=other&customerID=123&attemptID=456",
      ),
    ).status,
  ).toBe(400);
});
