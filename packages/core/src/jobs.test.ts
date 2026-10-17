import test from "node:test";
import assert from "node:assert/strict";
import { readJobQueueConfiguration } from "./jobs.ts";
test("core jobs require explicit Redis and isolate their prefix", () => {
  assert.throws(() => readJobQueueConfiguration({}), /REDIS/);
  for (const url of [
    "http://localhost",
    "redis://localhost/1?x=y",
    "redis://localhost/not-a-db",
  ])
    assert.throws(() =>
      readJobQueueConfiguration({ WEBDOCK_JOBS_REDIS_URL: url }),
    );
  const config = readJobQueueConfiguration({
    WEBDOCK_JOBS_REDIS_URL: "rediss://worker:secret@redis.example:6380/2",
    WEBDOCK_JOBS_PREFIX: "webdock-test",
  });
  assert.equal(config.connection.host, "redis.example");
  assert.equal(config.connection.db, 2);
  assert.deepEqual(config.connection.tls, {});
  assert.equal(config.prefix, "webdock-test");
});
