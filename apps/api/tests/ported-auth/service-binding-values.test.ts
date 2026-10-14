import test from "node:test";
import assert from "node:assert/strict";
import { databaseConnectionURL } from "../../src/modules/hosting/database-binding";
test("database binding escapes credentials and requires a verified mounted CA", () => {
  const value = databaseConnectionURL({
    host: "postgres-rw.wd-db-42.svc.cluster.local",
    port: 5432,
    database: "db_7",
    username: "wd_app_7",
    password: "a@b:/?#%",
    caPath: "/var/run/webdock/services/42/ca.crt",
  });
  const parsed = new URL(value);
  assert.equal(decodeURIComponent(parsed.password), "a@b:/?#%");
  assert.equal(parsed.hostname, "postgres-rw.wd-db-42.svc.cluster.local");
  assert.equal(parsed.searchParams.get("sslmode"), "verify-full");
  assert.equal(
    parsed.searchParams.get("sslrootcert"),
    "/var/run/webdock/services/42/ca.crt",
  );
  assert.throws(() =>
    databaseConnectionURL({
      host: "evil/path",
      port: 5432,
      database: "db_7",
      username: "wd_app_7",
      password: "secret",
      caPath: "/tmp/ca",
    }),
  );
});
