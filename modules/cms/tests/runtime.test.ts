import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createCMSDemoBridges } from "../src/server/demo-bridges";
import { createCMSDemoContent } from "../src/server/demo-content";
import { createCMSCanvasBridge } from "../src/server/canvas-bridge";
import { createCMSStudioShop } from "../src/server/studio-shop";
import { createCMSDispatch } from "../src/server/dispatch";
import {
  demoBridges,
  cmsAllowedOrigins,
} from "../src/server/demo-bridge-policy";
import type { CMSPorts, CMSRequestSession } from "../src/server/ports";
const bridge = {
  origin: "https://cms.example.test:8443",
  secret: "private-bridge-secret-".repeat(3),
  kind: "demo" as const,
  canvas: true,
  shop: true,
};
function fixture() {
  let enabled = true,
    role = "editor",
    preview: CMSRequestSession["preview"];
  const calls: { url: string; headers: Headers; init?: RequestInit }[] = [];
  const getSites = async () => [
    {
      id: "123",
      name: "Customer website",
      url: bridge.origin + "/admin",
      role,
    },
  ];
  const getStudioSession = async () => ({
    user: { id: "456" },
    operator: false,
    preview,
  });
  const requireCMS = () => {
    if (!enabled) throw Error("CMS disabled");
  };
  const config = () =>
    demoBridges(JSON.stringify({ "123": bridge }), [bridge.origin]);
  const fetch: CMSPorts["fetch"] = async (input, init) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      init,
    });
    return Response.json({ docs: [], page: 1, hasNextPage: false });
  };
  const access = createCMSDemoBridges({
    getSites,
    getStudioSession,
    requireCMS,
    demoBridges: config,
    fetch,
  });
  const content = createCMSDemoContent({
    demoAccess: access.demoAccess,
    fetch,
  });
  const canvas = createCMSCanvasBridge({
    demoAccess: access.demoAccess,
    getStudioSession,
    fetch,
  });
  const shop = createCMSStudioShop({ demoAccess: access.demoAccess, fetch });
  const dispatch = createCMSDispatch({
    ...access,
    ...content,
    ...canvas,
    ...shop,
    getSites,
    requireCMS,
    demoBridges: config,
  });
  return {
    access,
    dispatch,
    calls,
    setEnabled: (value: boolean) => (enabled = value),
    setRole: (value: string) => (role = value),
    setPreview: (value: CMSRequestSession["preview"]) => (preview = value),
  };
}
test("custom CMS origins require an exact configured HTTPS allowlist and keep legacy defaults", () => {
  assert.throws(() => demoBridges(JSON.stringify({ "123": bridge })));
  const allowed = cmsAllowedOrigins(JSON.stringify([bridge.origin]));
  assert.equal(
    demoBridges(JSON.stringify({ "123": bridge }), allowed)["123"].origin,
    bridge.origin,
  );
  for (const value of [
    "https://cms.example.test:8443/path",
    "http://cms.example.test",
    "https://user@cms.example.test",
    "https://cms.example.test:443",
  ])
    assert.throws(() => cmsAllowedOrigins(JSON.stringify([value])));
  assert.throws(() =>
    demoBridges(
      JSON.stringify({
        "123": { ...bridge, origin: "https://cms.example.test.evil.test" },
      }),
      allowed,
    ),
  );
  assert.throws(() => cmsAllowedOrigins("{}"));
});
test("remote CMS calls recheck current grants, deny preview writes and never forward browser credentials", async () => {
  const f = fixture();
  await f.access.demoRequest("123", 1, { action: "update" });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, bridge.origin + "/api/webdock/requests");
  assert.equal(
    f.calls[0].headers.get("authorization"),
    "Bearer " + bridge.secret,
  );
  assert.equal(f.calls[0].headers.get("cookie"), null);
  assert.equal(f.calls[0].init?.redirect, "error");
  assert.equal(f.calls[0].init?.cache, "no-store");
  f.setRole("reader");
  await assert.rejects(
    f.access.demoRequest("123", 1, { action: "update" }),
    /permission denied/,
  );
  assert.equal(f.calls.length, 1);
  f.setRole("admin");
  f.setPreview({ readOnly: true, status: "active", customerID: "789" });
  await assert.rejects(f.access.demoRequest("123", 1, { action: "update" }));
  assert.equal(f.calls.length, 1);
  await f.access.demoRequest("123");
  assert.equal(f.calls.length, 2);
  f.setPreview({ readOnly: true, status: "expired", customerID: "789" });
  await assert.rejects(f.access.demoRequest("123"));
  assert.equal(f.calls.length, 2);
});
test("direct module access is gated and public CMS views exclude bridge secrets", async () => {
  const f = fixture();
  const view = await f.dispatch.dispatchCMS("cms.access", ["123", false]);
  assert.ok(!JSON.stringify(view).includes(bridge.secret));
  const bridges = await f.dispatch.dispatchCMS("cms.bridges", []);
  assert.ok(!JSON.stringify(bridges).includes("secret"));
  f.setEnabled(false);
  await assert.rejects(f.access.demoRequest("123"), /CMS disabled/);
  await assert.rejects(
    f.dispatch.dispatchCMS("cms.bridges", []),
    /CMS disabled/,
  );
  assert.equal(f.calls.length, 0);
});
test("CMS module has no application or concrete provider imports and UI metadata has no server credentials", async () => {
  for (const file of await readdir(
    new URL("../src/server/", import.meta.url),
  )) {
    const source = await readFile(
      new URL("../src/server/" + file, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /(?:from\s+|import\s*\()["'][^"']*(?:apps\/|@webdock\/api|\.\.\/portal|@webdock\/adapter-)/,
    );
  }
  const ui = await readFile(new URL("../src/ui.ts", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /process\.env|Bearer|bridge\.secret|server\//);
});
