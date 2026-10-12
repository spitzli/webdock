import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { parseEnv } from "node:util";
import pg from "pg";
import { SCHEMAS, connection, fenceSQL, compare, main } from "./migrate.mjs";

test("identity and fence generation reject broader scope", () => {
  assert.throws(() =>
    connection("postgres://user:password@other/db", {
      host: "expected",
      port: 5432,
      database: "db",
      user: "user",
    }),
  );
  assert.throws(() =>
    connection("postgres://user:password@127.0.0.1/db", {
      host: "127.0.0.1",
      port: 5432,
      database: "db",
      user: "user",
      fixture: true,
    }),
  );
  assert.throws(() =>
    fenceSQL({ database: "db", user: "u" }, [
      { schema: "spitzli", name: "items", kind: "r" },
    ]),
  );
  assert.throws(() => compare({ tables: [1] }, { tables: [2] }));
  const sql = fenceSQL({ database: "db", user: "u" }, [
    { schema: "webdock", name: "items", kind: "r" },
  ]);
  assert.match(sql, /ACCESS EXCLUSIVE/);
  assert.match(sql, /ENABLE ALWAYS/);
  assert.doesNotMatch(sql, /ALTER DATABASE|ALTER ROLE|spitzli/);
});

test(
  "selective fence, consistent dump, exact restore and mismatch rejection",
  { skip: !process.env.MIGRATION_TEST_CONTAINER },
  async () => {
    const env = parseEnv(
      fs.readFileSync(process.env.MIGRATION_TEST_ENV, "utf8"),
    );
    const address = execFileSync(
      "docker",
      ["port", process.env.MIGRATION_TEST_CONTAINER, "5432"],
      { encoding: "utf8" },
    ).trim();
    assert.match(address, /^127\.0\.0\.1:\d+$/);
    const port = Number(address.split(":")[1]);
    const suffix = crypto.randomBytes(5).toString("hex");
    const source = "wd_migration_test_source_" + suffix,
      target = "wd_migration_test_target_" + suffix;
    const settings = {
      host: "127.0.0.1",
      port,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
    };
    const root = new pg.Client({ ...settings, database: env.POSTGRES_DB });
    await root.connect();
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "webdock-migration-"));
    let db;
    const oldSource = process.env.SOURCE_DATABASE_URL,
      oldTarget = process.env.TARGET_DATABASE_URL;
    try {
      await root.query(`CREATE DATABASE ${source}`);
      await root.query(`CREATE DATABASE ${target}`);
      db = new pg.Client({ ...settings, database: source });
      await db.connect();
      for (const schema of SCHEMAS) {
        if (schema !== "public") await db.query(`CREATE SCHEMA ${schema}`);
        await db.query(
          `CREATE TABLE ${schema}.items(id bigserial PRIMARY KEY,content text); INSERT INTO ${schema}.items(content) VALUES('same'),('same'),('comma, newline'||chr(10)||'unicode ä')`,
        );
      }
      await db.query(`
        CREATE TYPE webdock.structural_state AS ENUM ('first','last');
        CREATE DOMAIN webdock.positive_value AS integer CHECK (VALUE>0);
        CREATE TABLE webdock.empty_structure(value integer DEFAULT 1, state webdock.structural_state, positive webdock.positive_value);
        CREATE INDEX empty_structure_value_idx ON webdock.empty_structure(value);
        CREATE VIEW webdock.structure_view AS SELECT value FROM webdock.empty_structure;
        CREATE FUNCTION webdock.structure_value() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS 'SELECT 1';
      `);
      await db.query(
        'CREATE TABLE webdock."with spaces"(id integer); INSERT INTO webdock."with spaces" VALUES(1)',
      );
      await db.query(
        "CREATE TABLE webdock.events(id integer) PARTITION BY RANGE(id); CREATE TABLE webdock.events_one PARTITION OF webdock.events FOR VALUES FROM (0) TO (10); INSERT INTO webdock.events VALUES(1)",
      );
      await db.query(
        "CREATE SCHEMA spitzli; CREATE TABLE spitzli.items(id integer); CREATE SCHEMA stall; CREATE TABLE stall.items(id integer)",
      );
      const expected = (name) => ({
        host: "127.0.0.1",
        port,
        database: name,
        user: env.POSTGRES_USER,
        fixture: true,
      });
      const config = path.join(temp, "config.json"),
        artifact = path.join(temp, "platform.dump");
      fs.writeFileSync(
        config,
        JSON.stringify({ source: expected(source), target: expected(target) }),
      );
      const url = (name) =>
        `postgres://${encodeURIComponent(env.POSTGRES_USER)}:${encodeURIComponent(env.POSTGRES_PASSWORD)}@127.0.0.1:${port}/${name}`;
      process.env.SOURCE_DATABASE_URL = url(source);
      process.env.TARGET_DATABASE_URL = url(target);
      await assert.rejects(main(["export", config, artifact]));
      await main(["fence-sql", config, path.join(temp, "fence.sql")]);
      const fence = fs.readFileSync(path.join(temp, "fence.sql"), "utf8");
      const writer = new pg.Client({ ...settings, database: source });
      await writer.connect();
      try {
        await writer.query(
          "BEGIN; INSERT INTO webdock.items(content) VALUES('earlier writer')",
        );
        await assert.rejects(
          db.query(fence.replace("lock_timeout='5s'", "lock_timeout='100ms'")),
        );
        await db.query("ROLLBACK");
        await writer.query("COMMIT");
      } finally {
        await writer.end();
      }
      await db.query(fence);
      for (const operation of [
        "INSERT INTO webdock.items(content) VALUES('blocked')",
        "UPDATE webdock.items SET content='blocked'",
        "DELETE FROM webdock.items",
        "TRUNCATE webdock.items",
      ])
        await assert.rejects(db.query(operation));
      await db.query(
        "INSERT INTO spitzli.items VALUES(1); INSERT INTO stall.items VALUES(1)",
      );
      await main(["export", config, artifact]);
      assert.equal(fs.statSync(artifact).mode & 0o777, 0o600);
      await main(["restore", config, artifact]);
      await main(["verify", config, artifact]);
      await assert.rejects(main(["restore", config, artifact]));
      const restored = new pg.Client({ ...settings, database: target });
      await restored.connect();
      try {
        assert.equal(
          (
            await restored.query(
              "SELECT to_regclass('spitzli.items') AS relation",
            )
          ).rows[0].relation,
          null,
        );
        // Empty tables have no row hash signal: type/default/function drift must still fail.
        for (const [change, undo] of [
          ["ALTER TABLE webdock.empty_structure ALTER COLUMN positive TYPE bigint", "ALTER TABLE webdock.empty_structure ALTER COLUMN positive TYPE webdock.positive_value"],
          ["ALTER TABLE webdock.empty_structure ALTER COLUMN value SET DEFAULT 2", "ALTER TABLE webdock.empty_structure ALTER COLUMN value SET DEFAULT 1"],
          ["CREATE OR REPLACE FUNCTION webdock.structure_value() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS 'SELECT 2'", "CREATE OR REPLACE FUNCTION webdock.structure_value() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS 'SELECT 1'"],
          ["ALTER FUNCTION webdock.structure_value() SECURITY DEFINER", "ALTER FUNCTION webdock.structure_value() SECURITY INVOKER"],
          ["ALTER FUNCTION webdock.structure_value() SET search_path=public", "ALTER FUNCTION webdock.structure_value() SET search_path=pg_catalog"],
          ["ALTER SEQUENCE webdock.items_id_seq INCREMENT BY 2", "ALTER SEQUENCE webdock.items_id_seq INCREMENT BY 1"],
          ["ALTER TABLE webdock.empty_structure ADD CONSTRAINT empty_value CHECK(value>0)", "ALTER TABLE webdock.empty_structure DROP CONSTRAINT empty_value"],
        ]) {
          await restored.query(change);
          await assert.rejects(main(["verify", config, artifact]));
          await restored.query(undo);
          await main(["verify", config, artifact]);
        }
        await restored.query("SELECT setval('webdock.items_id_seq',999,true)");
        await assert.rejects(main(["verify", config, artifact]));
        const sequence = JSON.parse(
          fs.readFileSync(artifact + ".manifest.json", "utf8"),
        ).verification.sequences.find((s) => s.schema === "webdock");
        await restored.query("SELECT setval('webdock.items_id_seq',$1,$2)", [
          sequence.last_value,
          sequence.is_called,
        ]);
        await restored.query(
          "UPDATE webdock.items SET content='changed' WHERE id=1",
        );
        await assert.rejects(main(["verify", config, artifact]));
      } finally {
        await restored.end();
      }
      await main(["unfence-sql", config, path.join(temp, "unfence.sql")]);
      await db.query(fs.readFileSync(path.join(temp, "unfence.sql"), "utf8"));
      await db.query("INSERT INTO webdock.items(content) VALUES('resumed')");
    } finally {
      if (db) await db.end();
      await root.query(`DROP DATABASE IF EXISTS ${source} WITH (FORCE)`);
      await root.query(`DROP DATABASE IF EXISTS ${target} WITH (FORCE)`);
      await root.end();
      fs.rmSync(temp, { recursive: true, force: true });
      if (oldSource === undefined) delete process.env.SOURCE_DATABASE_URL;
      else process.env.SOURCE_DATABASE_URL = oldSource;
      if (oldTarget === undefined) delete process.env.TARGET_DATABASE_URL;
      else process.env.TARGET_DATABASE_URL = oldTarget;
    }
  },
);
