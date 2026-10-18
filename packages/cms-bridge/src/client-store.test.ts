import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, appendFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createBridgeTransport } from "./client.ts";
import { BridgeTransfers, type CMSBridgeTransferStore } from "./server.ts";
import { BridgeError } from "./auth.ts";
import { JSON_BYTES, type BridgeScope } from "./types.ts";
const scope: BridgeScope = {
  instance: "instance",
  project: "project",
  subject: "actor",
  role: "editor",
  grantEpoch: "1",
};
async function uncertainCommittedResponse(
  store: CMSBridgeTransferStore,
  effect: () => Promise<void>,
  outerFailure = "overflow",
) {
  let commitCalls = 0,
    transfer = "";
  const execute = async () => {
    await effect();
    return outerFailure === "overflow"
      ? new Response("x".repeat(JSON_BYTES + 1), {
          headers: { "content-type": "application/json" },
        })
      : Response.json({ saved: true });
  };
  const transport = createBridgeTransport(async (request) => {
    try {
      if (request.body?.op === "begin") {
        const result = await store.begin(scope, request.body);
        transfer = result.transfer;
        return { status: 200, body: result };
      }
      if (request.body?.op === "append")
        return { status: 200, body: await store.append(scope, request.body) };
      if (request.body?.op === "commit") {
        commitCalls++;
        const result = await store.commit(
          scope,
          request.body.transfer,
          "https://site.invalid",
          execute,
        );
        return outerFailure === "forbidden"
          ? {
              status: 403,
              body: { error: "Access was revoked after the save." },
            }
          : { status: 200, body: result };
      }
      throw Error("Unexpected request");
    } catch (error) {
      if (error instanceof BridgeError)
        return { status: error.status, body: { error: error.message } };
      throw error;
    }
  });
  await assert.rejects(
    transport("/api/cms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"module":"pages"}',
    }),
    (error) =>
      Boolean(
        error instanceof Error &&
        "code" in error &&
        error.code === "cms_save_uncertain",
      ),
  );
  assert.equal(
    commitCalls,
    1,
    "Transport must never retry commit automatically.",
  );
  if (outerFailure === "overflow")
    await assert.rejects(
      store.commit(scope, transfer, "https://site.invalid", execute),
      /reconciliation_required/,
    );
  else await store.commit(scope, transfer, "https://site.invalid", execute);
}
test("real filesystem response overflow after a successful effect is an uncertain save", async () => {
  const directory = await mkdtemp(`${tmpdir()}/cms-response-overflow-`);
  try {
    const effects = `${directory}/effects`;
    await uncertainCommittedResponse(
      new BridgeTransfers(`${directory}/transfers`),
      () => appendFile(effects, "saved\n"),
    );
    assert.equal(await readFile(effects, "utf8"), "saved\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test(
  "real PostgreSQL response overflow after a committed database effect is an uncertain save",
  { skip: !process.env.CMS_BRIDGE_TEST_DATABASE_URL },
  async () => {
    const url = new URL(process.env.CMS_BRIDGE_TEST_DATABASE_URL!);
    assert.ok(
      ["127.0.0.1", "localhost"].includes(url.hostname),
      "Disposable loopback PostgreSQL only.",
    );
    const { default: pg } = await import("pg");
    const { randomUUID } = await import("node:crypto");
    const { PostgresBridgeTransfers } = await import("./postgres.ts");
    const pool = new pg.Pool({ connectionString: url.toString(), max: 3 });
    const schema = `cms_uncertain_${randomUUID().replaceAll("-", "")}`;
    try {
      await pool.query(`CREATE SCHEMA "${schema}";
   CREATE TABLE "${schema}".cms_bridge_transfers(id uuid PRIMARY KEY, instance text NOT NULL, project text NOT NULL, subject text NOT NULL, role text NOT NULL, grant_epoch text NOT NULL, expires bigint NOT NULL, size integer NOT NULL, sha256 text NOT NULL, kind text NOT NULL, "offset" integer NOT NULL DEFAULT 0, state text NOT NULL, disposable boolean NOT NULL DEFAULT false, response bytea, result jsonb);
   CREATE TABLE "${schema}".cms_bridge_transfer_chunks(transfer uuid NOT NULL REFERENCES "${schema}".cms_bridge_transfers(id) ON DELETE CASCADE, "offset" integer NOT NULL, data bytea NOT NULL, PRIMARY KEY(transfer,"offset"));
   CREATE TABLE "${schema}".effects(id serial PRIMARY KEY);`);
      await uncertainCommittedResponse(
        new PostgresBridgeTransfers(pool, schema),
        async () => {
          await pool.query(`INSERT INTO "${schema}".effects DEFAULT VALUES`);
        },
      );
      assert.equal(
        Number(
          (await pool.query(`SELECT count(*) FROM "${schema}".effects`)).rows[0]
            .count,
        ),
        1,
      );
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);

test("real filesystem completed save followed by outer HTTP 403 stays uncertain", async () => {
  const directory = await mkdtemp(`${tmpdir()}/cms-commit-forbidden-`);
  try {
    const effects = `${directory}/effects`;
    await uncertainCommittedResponse(
      new BridgeTransfers(`${directory}/transfers`),
      () => appendFile(effects, "saved\n"),
      "forbidden",
    );
    assert.equal(await readFile(effects, "utf8"), "saved\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
