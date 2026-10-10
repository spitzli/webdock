import test from "node:test";
import assert from "node:assert/strict";
import { createGitVercelObserver } from "../src/lib/hosting/git-vercel-publication";
const credential = {
  token: "secret",
  teamID: "team_customer",
  configurationID: "icfg_customer",
  projectID: "prj_app",
  generation: 1,
};
const deployment = {
  id: "dpl_one",
  url: "app-123.vercel.app",
  projectId: "prj_app",
  ownerId: "team_customer",
  meta: { webdockReleaseID: "1" },
  prebuilt: true,
  target: "production",
  readyState: "READY",
  aliasAssigned: true,
  regions: ["fra1"],
  passiveRegions: [],
  functions: { "api/index": { runtime: "nodejs24.x", regions: ["fra1"] } },
};
test("resolves canonical deployment and verifies ready region and credential-free health", async () => {
  const observer = createGitVercelObserver(
    credential,
    async () => deployment,
    (async (input, init) => {
      assert.equal(String(input), "https://app-123.vercel.app/health");
      assert.equal(new Headers(init?.headers).has("authorization"), false);
      assert.equal(init?.redirect, "error");
      return new Response("ok");
    }) as typeof fetch,
  );
  assert.deepEqual(
    await observer.resolveDeployment({
      providerURL: "https://app-123.vercel.app",
      releaseID: "1",
    }),
    { deploymentID: "dpl_one", url: "https://app-123.vercel.app" },
  );
  const result = await observer.observeDeployment({
    deploymentID: "dpl_one",
    releaseID: "1",
    healthPath: "/health",
  });
  assert.equal(result.status, "ready");
  assert.equal(result.region, "fra1");
});
test("rejects cross-tenant/release identity and unsafe provider URLs", async () => {
  for (const change of [
    { projectId: "prj_other" },
    { ownerId: "team_other" },
    { meta: { webdockReleaseID: "2" } },
    { prebuilt: false },
    { url: "attacker.example" },
  ])
    await assert.rejects(
      createGitVercelObserver(credential, async () => ({
        ...deployment,
        ...change,
      })).resolveDeployment({
        providerURL: "https://app-123.vercel.app",
        releaseID: "1",
      }),
    );
  await assert.rejects(
    createGitVercelObserver(credential, async () => {
      throw Error("must not fetch");
    }).resolveDeployment({ providerURL: "https://127.0.0.1", releaseID: "1" }),
  );
});
test("never reports ready with non-EU functions, passive failover, missing alias or unhealthy app", async () => {
  for (const change of [
    { regions: ["iad1"] },
    { functions: { api: { regions: ["iad1"] } } },
    { passiveRegions: ["iad1"] },
    { aliasAssigned: false },
    { readyState: "BUILDING" },
  ]) {
    const result = await createGitVercelObserver(
      credential,
      async () => ({ ...deployment, ...change }),
      async () => new Response("ok"),
    ).observeDeployment({
      deploymentID: "dpl_one",
      releaseID: "1",
      healthPath: "/",
    });
    assert.notEqual(result.status, "ready");
  }
  const unhealthy = await createGitVercelObserver(
    credential,
    async () => deployment,
    async () => new Response(null, { status: 503 }),
  ).observeDeployment({
    deploymentID: "dpl_one",
    releaseID: "1",
    healthPath: "/",
  });
  assert.equal(unhealthy.status, "failed");
});
test("reconciles by persisted release identity and treats duplicate matches or incomplete search as ambiguous", async () => {
  for (const count of [0, 1, 2]) {
    const observer = createGitVercelObserver(credential, async (path) =>
      path.startsWith("/v6/")
        ? {
            deployments: Array.from({ length: count }, (_, i) => ({
              ...deployment,
              uid: "dpl_" + i,
            })),
            pagination: { next: null },
          }
        : { ...deployment, id: "dpl_0" },
    );
    const r = await observer.reconcileDeployment({ releaseID: "1", since: 1 });
    assert.equal(
      r.status,
      count === 0 ? "not-found" : count === 1 ? "found" : "ambiguous",
    );
  }
  const incomplete = await createGitVercelObserver(credential, async () => ({
    deployments: [],
    pagination: { next: 12 },
  })).reconcileDeployment({ releaseID: "1", since: 1 });
  assert.equal(incomplete.status, "ambiguous");
});
