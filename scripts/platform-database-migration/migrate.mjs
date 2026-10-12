#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import pg from "pg";

export const SCHEMAS = [
  "public",
  "webdock",
  "webdock_admin",
  "webdock_auth",
  "webdock_mail",
];
const FENCE = "wd_platform_migration_fence";
const FUNCTION = "wd_platform_migration_reject";
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
const fail = (message) => {
  throw new Error(message);
};
const privateWrite = (file, value) =>
  fs.writeFileSync(file, value, { flag: "wx", mode: 0o600 });
const digestFile = async (file) => {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
};

export function connection(urlValue, expected, ca) {
  const url = new URL(urlValue);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !expected ||
    url.hostname !== expected.host ||
    Number(url.port || 5432) !== expected.port ||
    decodeURIComponent(url.pathname.slice(1)) !== expected.database ||
    decodeURIComponent(url.username) !== expected.user
  )
    fail("Connection does not match the explicit expected identity");
  if (url.search)
    fail(
      "Connection URL parameters are forbidden; use the explicit CA setting",
    );
  const fixture = expected.fixture === true;
  if (
    fixture &&
    (!["127.0.0.1", "localhost"].includes(expected.host) ||
      !/^wd_migration_test_[a-z0-9_]+$/.test(expected.database))
  )
    fail("Fixture mode requires a dedicated loopback migration test database");
  if (!fixture && !ca) fail("An explicit trusted CA file is required");
  return {
    host: expected.host,
    port: expected.port,
    database: expected.database,
    user: expected.user,
    password: decodeURIComponent(url.password),
    ssl: fixture
      ? false
      : { rejectUnauthorized: true, ca: fs.readFileSync(ca, "utf8") },
  };
}
async function connect(config, side) {
  const expected = config[side];
  if (
    !expected ||
    Object.keys(expected).some(
      (key) =>
        !["host", "port", "database", "user", "fixture", "comment"].includes(
          key,
        ),
    )
  )
    fail("Unexpected identity configuration fields");
  const settings = connection(
    process.env[side.toUpperCase() + "_DATABASE_URL"],
    expected,
    config[side + "CA"],
  );
  const db = new pg.Client(settings);
  await db.connect();
  try {
    const identity = (
      await db.query(
        "SELECT current_database() AS db,current_user AS username,current_setting('server_version_num')::int AS version,shobj_description(oid,'pg_database') AS comment FROM pg_database WHERE datname=current_database() ",
      )
    ).rows[0];
    if (
      identity.db !== expected.database ||
      identity.username !== expected.user ||
      identity.version < 180000 ||
      identity.version >= 190000
    )
      fail("PostgreSQL 18 identity check failed");
    if (
      side === "target" &&
      !expected.fixture &&
      (!/^webdock:database:[1-9][0-9]*$/.test(expected.comment ?? "") ||
        identity.comment !== expected.comment)
    )
      fail("Managed target database identity marker mismatch");
    return { db, settings };
  } catch (error) {
    await db.end();
    throw error;
  }
}
async function readonly(db) {
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await db.query(
    "SET LOCAL search_path=pg_catalog; SET LOCAL timezone='UTC'; SET LOCAL intervalstyle='postgres'; SET LOCAL datestyle='ISO, YMD'; SET LOCAL extra_float_digits=3; SET LOCAL bytea_output='hex'; SET LOCAL row_security=off; SET LOCAL statement_timeout='5min'",
  );
}
async function catalog(db) {
  const rows = (
    await db.query(
      `SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1) AND c.relkind IN ('r','p','f') ORDER BY n.nspname::text COLLATE "C",c.relname::text COLLATE "C"`,
      [SCHEMAS],
    )
  ).rows;
  if (rows.some((row) => row.kind === "f"))
    fail("Foreign tables require an explicit migration design");
  const schemas = (
    await db.query("SELECT nspname FROM pg_namespace WHERE nspname=ANY($1)", [
      SCHEMAS,
    ])
  ).rows;
  if (schemas.length !== SCHEMAS.length)
    fail("All five selected schemas must exist");
  return rows;
}
async function sequences(db) {
  const rows = (
    await db.query(
      `SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1) AND c.relkind='S' ORDER BY n.nspname::text COLLATE "C",c.relname::text COLLATE "C"`,
      [SCHEMAS],
    )
  ).rows;
  const result = [];
  for (const row of rows) {
    const state = (
      await db.query(
        `SELECT last_value::text,is_called FROM ${quote(row.schema)}.${quote(row.name)}`,
      )
    ).rows[0];
    result.push({ ...row, ...state });
  }
  return result;
}
/** Compare logical structure before installing target policies or additive migrations. */
export async function structure(db) {
  // Deparsers qualify custom types/functions consistently instead of relying on login defaults.
  await db.query("SET LOCAL search_path=pg_catalog");
  const definitions = {
    relations: `SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,c.relpersistence AS persistence,
      c.relispartition AS partition,pg_get_partkeydef(c.oid) AS partition_key,
      pg_get_expr(c.relpartbound,c.oid,false) AS partition_bound,
      ARRAY(SELECT o FROM unnest(c.reloptions) o ORDER BY o COLLATE "C") AS options,
      ARRAY(SELECT pn.nspname||'.'||p.relname FROM pg_inherits i JOIN pg_class p ON p.oid=i.inhparent JOIN pg_namespace pn ON pn.oid=p.relnamespace WHERE i.inhrelid=c.oid ORDER BY i.inhseqno) AS parents
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1) AND c.relkind IN ('r','p','v','m','c') ORDER BY n.nspname::text COLLATE "C",c.relname::text COLLATE "C"`,
    columns: `SELECT n.nspname AS schema,c.relname AS relation,a.attname AS name,
      format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,
      pg_get_expr(d.adbin,d.adrelid,false) AS default_expression,a.attidentity AS identity,a.attgenerated AS generated,
      CASE WHEN a.attcollation<>0 THEN cn.nspname||'.'||co.collname END AS collation,
      a.attstorage AS storage,a.attcompression AS compression
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      LEFT JOIN pg_collation co ON co.oid=a.attcollation LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace
      WHERE n.nspname=ANY($1) AND c.relkind IN ('r','p','v','m','c') AND a.attnum>0 AND NOT a.attisdropped
      ORDER BY n.nspname::text COLLATE "C",c.relname::text COLLATE "C",a.attnum`,
    constraints: `SELECT n.nspname AS schema,co.conname AS name,c.relname AS relation,t.typname AS domain,
      co.contype AS kind,co.condeferrable AS deferrable,co.condeferred AS deferred,co.convalidated AS validated,
      pg_get_constraintdef(co.oid,false) AS definition
      FROM pg_constraint co JOIN pg_namespace n ON n.oid=co.connamespace LEFT JOIN pg_class c ON c.oid=co.conrelid LEFT JOIN pg_type t ON t.oid=co.contypid
      WHERE n.nspname=ANY($1) ORDER BY n.nspname::text COLLATE "C",co.conname::text COLLATE "C",c.relname::text COLLATE "C",t.typname::text COLLATE "C"`,
    indexes: `SELECT n.nspname AS schema,c.relname AS name,t.relname AS relation,i.indisvalid AS valid,i.indisready AS ready,
      pg_get_indexdef(c.oid) AS definition FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=ANY($1) ORDER BY n.nspname::text COLLATE "C",c.relname::text COLLATE "C"`,
    sequences: `SELECT n.nspname AS schema,c.relname AS name,format_type(s.seqtypid,NULL) AS type,
      s.seqstart::text AS start,s.seqincrement::text AS increment,s.seqmin::text AS min,s.seqmax::text AS max,s.seqcache::text AS cache,s.seqcycle AS cycle,
      tn.nspname AS owned_schema,t.relname AS owned_table,a.attname AS owned_column,d.deptype AS dependency
      FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')
      LEFT JOIN pg_class t ON t.oid=d.refobjid LEFT JOIN pg_namespace tn ON tn.oid=t.relnamespace LEFT JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
      WHERE n.nspname=ANY($1) ORDER BY n.nspname::text COLLATE "C",c.relname::text COLLATE "C"`,
    types: `SELECT n.nspname AS schema,t.typname AS name,t.typtype AS kind,
      CASE WHEN t.typtype='d' THEN format_type(t.typbasetype,t.typtypmod) END AS base_type,
      t.typnotnull AS not_null,pg_get_expr(t.typdefaultbin,0,false) AS default_expression,
      CASE WHEN t.typcollation<>0 THEN cn.nspname||'.'||co.collname END AS collation,
      ARRAY(SELECT e.enumlabel FROM pg_enum e WHERE e.enumtypid=t.oid ORDER BY e.enumsortorder) AS labels
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_collation co ON co.oid=t.typcollation LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace
      WHERE n.nspname=ANY($1) AND t.typtype IN ('e','d') ORDER BY n.nspname::text COLLATE "C",t.typname::text COLLATE "C"`,
    routines: `SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,p.prokind AS kind,
      p.prosecdef AS security_definer,p.provolatile AS volatility,p.proparallel AS parallel,p.proisstrict AS strict,p.proleakproof AS leakproof,p.proconfig AS configuration,
      CASE WHEN p.prokind<>'a' THEN pg_get_functiondef(p.oid) END AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname=ANY($1) AND NOT(n.nspname='webdock_auth' AND p.proname='wd_platform_migration_reject' AND p.pronargs=0)
      ORDER BY n.nspname::text COLLATE "C",p.proname::text COLLATE "C",pg_get_function_identity_arguments(p.oid) COLLATE "C"`,
    triggers: `SELECT n.nspname AS schema,c.relname AS relation,t.tgname AS name,t.tgenabled AS enabled,pg_get_triggerdef(t.oid,false) AS definition
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
      WHERE n.nspname=ANY($1) AND NOT t.tgisinternal AND NOT(t.tgname='wd_platform_migration_fence' AND pn.nspname='webdock_auth' AND p.proname='wd_platform_migration_reject' AND p.pronargs=0)
      ORDER BY n.nspname::text COLLATE "C",c.relname::text COLLATE "C",t.tgname::text COLLATE "C"`,
    views: `SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,pg_get_viewdef(c.oid,false) AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1) AND c.relkind IN ('v','m') ORDER BY n.nspname::text COLLATE "C",c.relname::text COLLATE "C"`,
    rules: `SELECT n.nspname AS schema,c.relname AS relation,r.rulename AS name,r.ev_enabled AS enabled,pg_get_ruledef(r.oid,false) AS definition
      FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=ANY($1) ORDER BY n.nspname::text COLLATE "C",c.relname::text COLLATE "C",r.rulename::text COLLATE "C"`,
  };
  const result = {};
  for (const [key, sql] of Object.entries(definitions)) result[key] = (await db.query(sql, [SCHEMAS])).rows;
  if (result.routines.some(routine => routine.kind === "a")) fail("User aggregates require explicit structural verification support");
  return result;
}

export async function contents(db) {
  const tables = [];
  for (const table of await catalog(db)) {
    const relation = `${quote(table.schema)}.${quote(table.name)}`;
    const hash = crypto.createHash("sha256");
    let count = 0;
    // ONLY counts partitions once; sorting provides deterministic multiset equality.
    await db.query(
      `DECLARE migration_rows NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS row FROM ONLY ${relation} t ORDER BY row_to_json(t)::text COLLATE "C"`,
    );
    try {
      while (true) {
        const rows = (await db.query("FETCH FORWARD 256 FROM migration_rows"))
          .rows;
        if (!rows.length) break;
        for (const { row } of rows) {
          const bytes = Buffer.from(row);
          hash.update(String(bytes.length) + ":");
          hash.update(bytes);
          count++;
        }
      }
    } finally {
      await db.query("CLOSE migration_rows");
    }
    tables.push({ ...table, count, sha256: hash.digest("hex") });
  }
  return { schemas: SCHEMAS, tables, sequences: await sequences(db), structure: await structure(db) };
}
export function compare(expected, actual) {
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    fail("Table content/count, catalog, or sequence verification failed");
}
export function fenceSQL(expected, tables, remove = false) {
  if (
    !tables.length ||
    tables.some(
      (t) => !SCHEMAS.includes(t.schema) || !["r", "p"].includes(t.kind),
    )
  )
    fail("Invalid fence table inventory");
  const qualified = (t) => `${quote(t.schema)}.${quote(t.name)}`;
  const locks = tables
    .map((t) => `LOCK TABLE ONLY ${qualified(t)} IN ACCESS EXCLUSIVE MODE;`)
    .join("\n");
  const triggers = tables
    .map((t) =>
      remove
        ? `DROP TRIGGER ${quote(FENCE)} ON ${qualified(t)};`
        : `CREATE TRIGGER ${quote(FENCE)} BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON ${qualified(t)} FOR EACH STATEMENT EXECUTE FUNCTION webdock_auth.${FUNCTION}();\nALTER TABLE ${qualified(t)} ENABLE ALWAYS TRIGGER ${quote(FENCE)};`,
    )
    .join("\n");
  return `-- Review and execute manually against the guarded source. No customer schema is fenced.\nBEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='60s';\nDO $guard$ BEGIN IF current_database()<>${literal(expected.database)} OR current_user<>${literal(expected.user)} OR current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999 THEN RAISE EXCEPTION 'Source identity mismatch'; END IF; END $guard$;\nSELECT pg_advisory_xact_lock(hashtextextended('webdock-platform-migration-fence',0));\n${locks}\n${remove ? "" : `CREATE FUNCTION webdock_auth.${FUNCTION}() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $f$ BEGIN RAISE EXCEPTION 'Webdock platform migration write fence' USING ERRCODE='55000'; END $f$;\nREVOKE ALL ON FUNCTION webdock_auth.${FUNCTION}() FROM PUBLIC;\n`}${triggers}\n${remove ? `DROP FUNCTION webdock_auth.${FUNCTION}();\n` : ""}COMMIT;\n`;
}
async function checkFence(db, tables) {
  const rows = (
    await db.query(
      `SELECT n.nspname AS schema,c.relname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace f ON f.oid=p.pronamespace WHERE n.nspname=ANY($1) AND t.tgname=$2 AND t.tgenabled='A' AND t.tgtype=62 AND p.proname=$3 AND f.nspname='webdock_auth'`,
      [SCHEMAS, FENCE, FUNCTION],
    )
  ).rows;
  if (
    tables.some(
      (t) => !rows.some((r) => r.schema === t.schema && r.name === t.name),
    )
  )
    fail(
      "Every selected table must have the always-enabled migration write fence",
    );
}
async function tool(binary, args, settings, ca, log) {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("PG")),
  );
  const env = {
    ...inherited,
    PGCONNECT_TIMEOUT: "15",
    PGHOST: settings.host,
    PGPORT: String(settings.port),
    PGDATABASE: settings.database,
    PGUSER: settings.user,
    PGPASSWORD: settings.password,
    PGSSLMODE: settings.ssl ? "verify-full" : "disable",
    PGSSLROOTCERT: ca ?? "",
    PGOPTIONS: "-c statement_timeout=300000",
  };
  const fd = fs.openSync(log, "wx", 0o600);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(binary, args, { env, stdio: ["ignore", fd, fd] });
      child.on("error", () =>
        reject(new Error("PostgreSQL utility unavailable")),
      );
      child.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(
              new Error("PostgreSQL utility failed; inspect its private log"),
            ),
      );
    });
  } finally {
    fs.closeSync(fd);
  }
}
async function pg18(binary) {
  const version = await new Promise((resolve, reject) => {
    let out = "";
    const child = spawn(binary, ["--version"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    child.stdout.on("data", (data) => (out += data));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error("PostgreSQL tool unavailable")),
    );
  });
  if (!/\(PostgreSQL\) 18\./.test(version))
    fail("PostgreSQL 18 command-line tools required");
}
export async function main([command, configFile, output]) {
  if (
    !["fence-sql", "unfence-sql", "export", "verify", "restore"].includes(
      command,
    ) ||
    !configFile ||
    !output
  )
    fail(
      "Usage: migrate.mjs fence-sql|unfence-sql|export|verify|restore config.json artifact-path",
    );
  process.umask(0o077);
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  if (command === "fence-sql" || command === "unfence-sql") {
    const { db } = await connect(config, "source");
    try {
      await readonly(db);
      privateWrite(
        output,
        fenceSQL(config.source, await catalog(db), command === "unfence-sql"),
      );
      await db.query("COMMIT");
    } finally {
      await db.end();
    }
    return;
  }
  if (command === "export") {
    await pg18("pg_dump");
    if (fs.existsSync(output) || fs.existsSync(output + ".manifest.json"))
      fail("Export evidence already exists");
    const { db, settings } = await connect(config, "source");
    try {
      await readonly(db);
      const tables = await catalog(db);
      await checkFence(db, tables);
      const before = await sequences(db);
      const snapshot = (
        await db.query("SELECT pg_export_snapshot() AS snapshot")
      ).rows[0].snapshot;
      await tool(
        "pg_dump",
        [
          "--format=custom",
          "--no-owner",
          "--no-acl",
          "--lock-wait-timeout=5000",
          "--snapshot=" + snapshot,
          "--file=" + output,
          ...SCHEMAS.map((s) => "--schema=" + s),
        ],
        settings,
        config.sourceCA,
        output + ".export.log",
      );
      const verification = await contents(db);
      compare(before, verification.sequences);
      await db.query("COMMIT");
      privateWrite(
        output + ".manifest.json",
        JSON.stringify(
          {
            version: 2,
            source: config.source,
            sha256: await digestFile(output),
            verification,
          },
          null,
          2,
        ),
      );
    } finally {
      await db.end();
    }
    return;
  }
  const manifest = JSON.parse(
    fs.readFileSync(output + ".manifest.json", "utf8"),
  );
  if (
    manifest.version !== 2 ||
    !manifest.verification?.structure ||
    JSON.stringify(manifest.verification?.schemas) !==
      JSON.stringify(SCHEMAS) ||
    manifest.sha256 !== (await digestFile(output))
  )
    fail("Export manifest or artifact integrity mismatch");
  const { db, settings } = await connect(config, "target");
  try {
    if (command === "verify") {
      await readonly(db);
      compare(manifest.verification, await contents(db));
      await db.query("COMMIT");
      return;
    }
    await pg18("pg_restore");
    const existing = (
      await db.query(
        "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1) AND c.relkind IN ('r','p','S','f','v','m') LIMIT 1",
        [SCHEMAS],
      )
    ).rowCount;
    if (existing)
      fail(
        "Target selected schemas are not empty; restore refuses replacement",
      );
    // List first, then omit only our known fence objects. Dump contents remain private.
    await tool(
      "pg_restore",
      ["--list", output],
      settings,
      config.targetCA,
      output + ".toc",
    );
    const toc = fs.readFileSync(output + ".toc", "utf8").split("\n");
    const existingSchemas = new Set(
      (
        await db.query(
          "SELECT nspname FROM pg_namespace WHERE nspname=ANY($1)",
          [SCHEMAS],
        )
      ).rows.map((row) => row.nspname),
    );
    const selected = toc.filter((line) => {
      if (
        new RegExp(
          ` (TRIGGER (?:public|webdock|webdock_admin|webdock_auth|webdock_mail) .+ ${FENCE}|FUNCTION webdock_auth ${FUNCTION}\\(\\)) `,
        ).test(line)
      )
        return false;
      const schema = line.match(/ SCHEMA - ([^ ]+) /)?.[1];
      return !schema || !existingSchemas.has(schema);
    });
    privateWrite(output + ".restore-list", selected.join("\n"));
    await tool(
      "pg_restore",
      [
        "--single-transaction",
        "--exit-on-error",
        "--no-owner",
        "--no-acl",
        "--use-list=" + output + ".restore-list",
        "--dbname=" + settings.database,
        output,
      ],
      settings,
      config.targetCA,
      output + ".restore.log",
    );
  } finally {
    await db.end();
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(process.argv.slice(2))
    .then(() => console.log("Migration utility completed."))
    .catch(() => {
      console.error(
        "Migration utility failed closed; inspect the private configuration/artifact/log.",
      );
      process.exitCode = 1;
    });
