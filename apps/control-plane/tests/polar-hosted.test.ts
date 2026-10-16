import { expect, test } from "bun:test";
import Elysia from "elysia";
import { createHmac, randomUUID } from "node:crypto";
import { createRegistry } from "@webdock/module-sdk";
import { billingManifest } from "@webdock/module-billing/manifest";
import { hostedPolarProtocols } from "../src/protocols/polar-hosted";

const config = { apiOrigin: "http://localhost:3130" };
const secret = "fixture-polar-webhook-secret-at-least-32";
function app(
  createCheckout = async (_input: { products: string[] }) => ({
    url: "https://polar.sh/dashboard/spitzli",
  }),
  requireCheckout: () => void = () => {},
) {
  const result = new Elysia();
  for (const mount of hostedPolarProtocols(config, {
    createCheckout,
    webhookSecret: () => secret,
    requireCheckout,
  }))
    result.use(mount.app);
  return result.compile();
}
test("hosted checkout validates product IDs and sends no success URL or customer override", async () => {
  const calls: unknown[] = [],
    server = app(async (input) => {
      calls.push(input);
      return { url: "https://polar.sh/dashboard/spitzli" };
    });
  for (const query of ["", "?products=invalid"])
    expect(
      (await server.handle(new Request(config.apiOrigin + "/checkout" + query)))
        .status,
    ).toBe(400);
  expect(calls).toHaveLength(0);
  const id = randomUUID(),
    response = await server.handle(
      new Request(
        config.apiOrigin +
          "/checkout?products=" +
          id +
          "&customerId=untrusted&successUrl=https://polar.sh",
      ),
    );
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(
    "https://polar.sh/dashboard/spitzli",
  );
  expect(calls).toEqual([{ products: [id] }]);
});
test("checkout provider failures do not expose tokens or provider details", async () => {
  const server = app(async () => {
    throw Error("private provider details");
  });
  const response = await server.handle(
    new Request(config.apiOrigin + "/checkout?products=" + randomUUID()),
  );
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("private provider details");
});
test("raw signed order/customer events are acknowledged; tampered bodies are rejected", async () => {
  const server = app();
  for (const type of ["order.paid", "customer.state_changed"]) {
    const body = JSON.stringify(
      {
        type,
        api_version: "2026-10",
        timestamp: new Date().toISOString(),
        data: { id: randomUUID() },
      },
      null,
      2,
    );
    const id = randomUUID(),
      timestamp = String(Math.floor(Date.now() / 1000));
    const headers = {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature":
        "v1," +
        createHmac("sha256", secret)
          .update(id + "." + timestamp + "." + body)
          .digest("base64"),
    };
    expect(
      (
        await server.handle(
          new Request(config.apiOrigin + "/api/webhook/polar", {
            method: "POST",
            headers,
            body,
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await server.handle(
          new Request(config.apiOrigin + "/api/webhook/polar", {
            method: "POST",
            headers,
            body: body + " ",
          }),
        )
      ).status,
    ).toBe(403);
  }
});

test("legacy checkout refuses disabled and draining Billing before provider I/O", async () => {
  for (const state of ["disabled", "draining"] as const) {
    let calls = 0;
    const registry = createRegistry([billingManifest], {
      configVersion: 1,
      modules: { billing: { state } },
    });
    const server = app(
      async () => {
        calls++;
        return { url: "https://polar.sh/checkout/fixture" };
      },
      () => registry.require("billing", "provision"),
    );
    const response = await server.handle(
      new Request(config.apiOrigin + "/checkout?products=" + randomUUID()),
    );
    expect(response.status).toBe(503);
    expect(calls).toBe(0);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
});
test("checkout guard is read per request and does not gate existing signed webhooks", async () => {
  let draining = false,
    guardCalls = 0,
    providerCalls = 0;
  const server = app(
    async () => {
      providerCalls++;
      return { url: "https://polar.sh/checkout/fixture" };
    },
    () => {
      guardCalls++;
      if (draining) throw Error("draining");
    },
  );
  const request = () =>
    new Request(config.apiOrigin + "/checkout?products=" + randomUUID());
  expect((await server.handle(request())).status).toBe(302);
  draining = true;
  expect((await server.handle(request())).status).toBe(503);
  expect(providerCalls).toBe(1);
  const body = JSON.stringify({
      type: "order.paid",
      api_version: "2026-10",
      timestamp: new Date().toISOString(),
      data: { id: randomUUID() },
    }),
    id = randomUUID(),
    timestamp = String(Math.floor(Date.now() / 1000));
  const response = await server.handle(
    new Request(config.apiOrigin + "/api/webhook/polar", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "webhook-id": id,
        "webhook-timestamp": timestamp,
        "webhook-signature":
          "v1," +
          createHmac("sha256", secret)
            .update(id + "." + timestamp + "." + body)
            .digest("base64"),
      },
      body,
    }),
  );
  expect(response.status).toBe(200);
  expect(guardCalls).toBe(2);
});

test("partially injected hosted transport still uses the default installation guard", async () => {
  const previous = process.env.WEBDOCK_MODULES;
  let calls = 0;
  try {
    process.env.WEBDOCK_MODULES = JSON.stringify({
      configVersion: 1,
      modules: { billing: { state: "draining" } },
    });
    const router = new Elysia();
    for (const mount of hostedPolarProtocols(config, {
      createCheckout: async () => {
        calls++;
        return { url: "https://polar.sh/checkout/fixture" };
      },
      webhookSecret: () => secret,
    }))
      router.use(mount.app);
    const server = router.compile();
    expect(
      (
        await server.handle(
          new Request(config.apiOrigin + "/checkout?products=" + randomUUID()),
        )
      ).status,
    ).toBe(503);
    expect(calls).toBe(0);
  } finally {
    if (previous === undefined) delete process.env.WEBDOCK_MODULES;
    else process.env.WEBDOCK_MODULES = previous;
  }
});
