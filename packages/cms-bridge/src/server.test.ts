import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { BridgeTransfers } from "./server.ts";
import { CHUNK_BYTES, type BridgeScope } from "./types.ts";
const scope: BridgeScope = {
  instance: "site",
  project: "project",
  subject: "actor",
  role: "editor",
  grantEpoch: "1",
};
const encoded = () =>
  Buffer.from(
    JSON.stringify({
      method: "POST",
      path: "/api/cms",
      contentType: "application/json",
      bodyBase64: Buffer.from('{"module":"pages"}').toString("base64"),
    }),
  );
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
test("transfers enforce actor/project/epoch, digest, bounds and idempotent completed commit", async () => {
  const directory = await mkdtemp(`${tmpdir()}/cms-transfer-`);
  try {
    let calls = 0;
    const store = new BridgeTransfers(directory);
    const bytes = encoded();
    const { transfer } = await store.begin(scope, {
      op: "begin",
      size: bytes.length,
      sha256: hash(bytes),
      kind: "json",
    });
    await assert.rejects(
      store.append(
        { ...scope, grantEpoch: "2" },
        { op: "append", transfer, offset: 0, data: bytes.toString("base64") },
      ),
    );
    await assert.rejects(
      store.append(scope, {
        op: "append",
        transfer,
        offset: 0,
        data: Buffer.alloc(CHUNK_BYTES + 1).toString("base64"),
      }),
    );
    await store.append(scope, {
      op: "append",
      transfer,
      offset: 0,
      data: bytes.toString("base64"),
    });
    await assert.rejects(
      store.append(scope, { op: "append", transfer, offset: 0, data: "eA==" }),
    );
    const execute = async (request: Request) => {
      calls++;
      assert.equal(request.headers.get("cookie"), null);
      return Response.json({ saved: true });
    };
    const result = await store.commit(
      scope,
      transfer,
      "https://site.invalid",
      execute,
    );
    assert.equal(calls, 1);
    assert.deepEqual(
      await store.commit(scope, transfer, "https://site.invalid", execute),
      result,
    );
    assert.equal(calls, 1);
    const chunk = await store.read(scope, result.transfer, 0);
    assert.equal(chunk.done, true);
    assert.equal(
      JSON.parse(Buffer.from(chunk.data, "base64").toString()).status,
      200,
    );
    await assert.rejects(
      store.read({ ...scope, project: "other" }, result.transfer, 0),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("interrupted execution is durable and never retried; wrong digests and GET mutations are denied", async () => {
  const directory = await mkdtemp(`${tmpdir()}/cms-transfer-`);
  try {
    const store = new BridgeTransfers(directory);
    const bytes = encoded();
    const { transfer } = await store.begin(scope, {
      op: "begin",
      size: bytes.length,
      sha256: hash(bytes),
      kind: "json",
    });
    await store.append(scope, {
      op: "append",
      transfer,
      offset: 0,
      data: bytes.toString("base64"),
    });
    await assert.rejects(
      store.commit(scope, transfer, "https://site.invalid", async () => {
        throw Error("crash");
      }),
    );
    let calls = 0;
    await assert.rejects(
      new BridgeTransfers(directory).commit(
        scope,
        transfer,
        "https://site.invalid",
        async () => {
          calls++;
          return Response.json({});
        },
      ),
      /reconciliation_required/,
    );
    assert.equal(calls, 0);
    const wrong = await store.begin(scope, {
      op: "begin",
      size: bytes.length,
      sha256: "0".repeat(64),
      kind: "json",
    });
    await store.append(scope, {
      op: "append",
      transfer: wrong.transfer,
      offset: 0,
      data: bytes.toString("base64"),
    });
    await assert.rejects(
      store.commit(scope, wrong.transfer, "https://site.invalid", async () =>
        Response.json({}),
      ),
      /digest/,
    );
    await assert.rejects(
      store.get(
        scope,
        Buffer.from(
          JSON.stringify({ method: "POST", path: "/api/cms" }),
        ).toString("base64url"),
        "https://site.invalid",
        async () => Response.json({}),
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("completed read transfers release capacity while mutation receipts survive download", async () => {
  const directory = await mkdtemp(`${tmpdir()}/cms-transfer-`);
  try {
    const store = new BridgeTransfers(directory);
    const request = Buffer.from(
      JSON.stringify({ method: "GET", path: "/api/cms" }),
    ).toString("base64url");
    for (let i = 0; i < 40; i++) {
      const result = await store.get(
        scope,
        request,
        "https://site.invalid",
        async () => Response.json({ i }),
      );
      assert.equal((await store.read(scope, result.transfer, 0)).done, true);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("expired active execution is retained until its outcome is durable", async () => {
  const directory = await mkdtemp(`${tmpdir()}/cms-transfer-`);
  try {
    let now = 0;
    const store = new BridgeTransfers(directory, () => now);
    const bytes = encoded();
    const { transfer } = await store.begin(scope, {
      op: "begin",
      size: bytes.length,
      sha256: hash(bytes),
      kind: "json",
    });
    await store.append(scope, {
      op: "append",
      transfer,
      offset: 0,
      data: bytes.toString("base64"),
    });
    let finish!: () => void;
    let started!: () => void;
    const executing = new Promise<void>((resolve) => (started = resolve));
    const committed = store.commit(
      scope,
      transfer,
      "https://site.invalid",
      async () => {
        started();
        await new Promise<void>((resolve) => (finish = resolve));
        return Response.json({ saved: true });
      },
    );
    await executing;
    now = 11 * 60_000;
    await store.begin(scope, {
      op: "begin",
      size: bytes.length,
      sha256: hash(bytes),
      kind: "json",
    });
    assert.equal(
      JSON.parse(await readFile(`${directory}/${transfer}/entry.json`, "utf8"))
        .state,
      "executing",
    );
    finish();
    await committed;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("completed mutation receipts do not consume active-upload slots", async () => {
  const directory = await mkdtemp(`${tmpdir()}/cms-transfer-`);
  try {
    const store = new BridgeTransfers(directory);
    const bytes = encoded();
    for (let i = 0; i < 25; i++) {
      const { transfer } = await store.begin(scope, {
        op: "begin",
        size: bytes.length,
        sha256: hash(bytes),
        kind: "json",
      });
      await store.append(scope, {
        op: "append",
        transfer,
        offset: 0,
        data: bytes.toString("base64"),
      });
      const result = await store.commit(
        scope,
        transfer,
        "https://site.invalid",
        async () => Response.json({ i }),
      );
      await store.read(scope, result.transfer, 0);
      assert.deepEqual(
        await store.commit(
          scope,
          transfer,
          "https://site.invalid",
          async () => {
            throw Error("duplicate");
          },
        ),
        result,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("read capacity is reserved before executing database work", async () => {
  const directory = await mkdtemp(`${tmpdir()}/cms-transfer-`);
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => (finish = resolve));
  let requests: Promise<unknown>[] = [];
  try {
    const store = new BridgeTransfers(directory);
    const descriptor = Buffer.from(
      JSON.stringify({ method: "GET", path: "/api/cms" }),
    ).toString("base64url");
    let started = 0;
    requests = Array.from({ length: 16 }, () =>
      store.get(scope, descriptor, "https://site.invalid", async () => {
        started++;
        await gate;
        return Response.json({});
      }),
    );
    while (started < 16) await new Promise((resolve) => setTimeout(resolve, 1));
    let extra = 0;
    await assert.rejects(
      store.get(scope, descriptor, "https://site.invalid", async () => {
        extra++;
        return Response.json({});
      }),
    );
    assert.equal(extra, 0);
    finish();
    await Promise.all(requests);
  } finally {
    finish();
    await Promise.allSettled(requests);
    await rm(directory, { recursive: true, force: true });
  }
});
test("a complete 10 MiB media request decodes and commits without regex stack overflow", async () => {
  const directory = await mkdtemp(`${tmpdir()}/cms-transfer-`);
  try {
    const store = new BridgeTransfers(directory);
    const body = Buffer.alloc(10 * 1024 * 1024, 120);
    const bytes = Buffer.from(
      JSON.stringify({
        method: "POST",
        path: "/api/cms",
        contentType: "multipart/form-data; boundary=test",
        bodyBase64: body.toString("base64"),
      }),
    );
    const { transfer } = await store.begin(scope, {
      op: "begin",
      size: bytes.length,
      sha256: hash(bytes),
      kind: "media",
    });
    for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES)
      await store.append(scope, {
        op: "append",
        transfer,
        offset,
        data: bytes.subarray(offset, offset + CHUNK_BYTES).toString("base64"),
      });
    let executed = 0;
    await store.commit(
      scope,
      transfer,
      "https://site.invalid",
      async (request) => {
        executed++;
        assert.deepEqual(Buffer.from(await request.arrayBuffer()), body);
        return Response.json({ saved: true });
      },
    );
    assert.equal(executed, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('active transfers reserve their future terminal receipt capacity',async()=>{
 const directory=await mkdtemp(`${tmpdir()}/cms-transfer-`);try{const store=new BridgeTransfers(directory);const bytes=encoded();
 for(let i=0;i<127;i++){const {transfer}=await store.begin(scope,{op:'begin',size:bytes.length,sha256:hash(bytes),kind:'json'});await store.append(scope,{op:'append',transfer,offset:0,data:bytes.toString('base64')});await store.commit(scope,transfer,'https://site.invalid',async()=>Response.json({i}))}
 await store.begin(scope,{op:'begin',size:bytes.length,sha256:hash(bytes),kind:'json'});await assert.rejects(store.begin(scope,{op:'begin',size:bytes.length,sha256:hash(bytes),kind:'json'}),/capacity/);
 }finally{await rm(directory,{recursive:true,force:true})}
});
test('scope equality is independent of JSON object key order',async()=>{
 const {sameBridgeScope}=await import('./server.ts');
 assert.equal(sameBridgeScope(scope,{role:scope.role,subject:scope.subject,project:scope.project,instance:scope.instance,grantEpoch:scope.grantEpoch}),true);
 assert.equal(sameBridgeScope(scope,{...scope,project:'other'}),false);
});
