import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { snowflakeSQL } from "../src/lib/snowflake-schema";
import { nextSnowflake, closeSnowflakePool } from "../src/lib/snowflake";
const url = new URL(process.env.DATABASE_URL!);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw Error("Tests require disposable localhost PostgreSQL");
const db = new Pool({ connectionString: url.toString(), max: 12 });
test("Snowflakes are unique decimal strings, survive concurrent workers and preserve precision", async () => {
  await db.query("CREATE SCHEMA IF NOT EXISTS webdock_admin");
  await db.query(snowflakeSQL);
  const ids = await Promise.all(
    Array.from({ length: 300 }, () => nextSnowflake()),
  );
  const workers = await Promise.all(
    Array.from({ length: 300 }, () =>
      db.query<{ id: string }>("SELECT webdock_admin.next_snowflake() AS id"),
    ),
  );
  assert.equal(
    new Set([...ids, ...workers.map((r) => r.rows[0].id)]).size,
    600,
  );
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.match(id, /^[1-9][0-9]{16,18}$/);
    assert.ok(BigInt(id) > BigInt(Number.MAX_SAFE_INTEGER));
    assert.equal((BigInt(id) >> 12n) & 1023n, 0n);
  }
  assert.ok(ids.every((id, i) => i === 0 || BigInt(id) > BigInt(ids[i - 1])));
  const transaction = await db.connect();
  await transaction.query("BEGIN");
  const allocated = await nextSnowflake();
  await transaction.query("ROLLBACK");
  transaction.release();
  assert.ok(BigInt(await nextSnowflake()) > BigInt(allocated));
  await db.query(
    "UPDATE webdock_admin.snowflake_state SET last_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1767225600000+100, sequence=4095",
  );
  const overflow = BigInt(await nextSnowflake());
  assert.equal(overflow & 4095n, 0n);
  await db.query(
    "UPDATE webdock_admin.snowflake_state SET last_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1767225600000+10000",
  );
  await assert.rejects(nextSnowflake(), /clock/i);
  await db.query(
    "UPDATE webdock_admin.snowflake_state SET last_ms=0, sequence=-1",
  );
});
test.after(async () => {
  await closeSnowflakePool();
  await db.end();
});
